import { browser } from "./browser/browser";
import { registry } from "./registry";
import { session } from "@web/session";
import { Component, xml, onWillStart, whenReady } from "@odoo/owl";

const cacheMapByDocument = new Map();

function getCacheMap(targetDoc) {
    if (!cacheMapByDocument.has(targetDoc)) {
        cacheMapByDocument.set(targetDoc, new Map());
    }
    return cacheMapByDocument.get(targetDoc);
}

export function computeBundleCacheMap(targetDoc) {
    const cacheMap = getCacheMap(targetDoc);
    for (const script of targetDoc.head.querySelectorAll("script[src]")) {
        cacheMap.set(script.src, Promise.resolve(true));
    }
    for (const link of targetDoc.head.querySelectorAll("link[rel=stylesheet][href]")) {
        cacheMap.set(link.href, Promise.resolve(true));
    }
}

whenReady(() => computeBundleCacheMap(document));

/**
 * @param {HTMLLinkElement | HTMLScriptElement} el
 * @param {(event: Event) => any} onLoad
 * @param {(error: Error) => any} onError
 */
const onLoadAndError = (el, onLoad, onError) => {
    const onLoadListener = (event) => {
        removeListeners();
        onLoad(event);
    };

    const onErrorListener = (error) => {
        removeListeners();
        onError(error);
    };

    const removeListeners = () => {
        el.removeEventListener("load", onLoadListener);
        el.removeEventListener("error", onErrorListener);
    };

    el.addEventListener("load", onLoadListener);
    el.addEventListener("error", onErrorListener);
};

/**
 * This export is done only in order to modify the behavior of the exported
 * functions. This is done in order to be able to make a test environment.
 * Modules should only use the methods exported below.
 */
export const assets = {
    retries: {
        count: 3,
        delay: 5000,
        extraDelay: 2500,
    },
};

export class AssetsLoadingError extends Error {}

/**
 * Loads the given url inside a script tag in targetDoc.
 *
 * @param {string} url the url of the script
 * @param {Document} [targetDoc=document]
 * @returns {Promise<true>} resolved when the script has been loaded
 */
assets.loadJS = async function loadJS(url, targetDoc = document) {
    const cacheMap = getCacheMap(targetDoc);
    if (cacheMap.has(url)) {
        return cacheMap.get(url);
    }
    const scriptEl = targetDoc.createElement("script");
    scriptEl.type = url.includes("web/static/lib/pdfjs/") ? "module" : "text/javascript";
    scriptEl.src = url;
    const promise = new Promise((resolve, reject) => {
        onLoadAndError(scriptEl, resolve, () => {
            cacheMap.delete(url);
            reject(new AssetsLoadingError(`The loading of ${url} failed`));
        });
    });
    cacheMap.set(url, promise);
    targetDoc.head.appendChild(scriptEl);
    return promise;
};

/**
 * Loads the given url as a stylesheet in targetDoc.
 *
 * @param {string} url the url of the stylesheet
 * @param {Object} options
 * @param {Number} [options.retryCount=0]
 * @param {Document} [options.targetDoc=document]
 * @returns {Promise<true>} resolved when the stylesheet has been loaded
 */
assets.loadCSS = async function loadCSS(url, { retryCount = 0, targetDoc = document } = {}) {
    const cacheMap = getCacheMap(targetDoc);
    if (cacheMap.has(url)) {
        return cacheMap.get(url);
    }
    const linkEl = targetDoc.createElement("link");
    linkEl.type = "text/css";
    linkEl.rel = "stylesheet";
    linkEl.href = url;
    const promise = new Promise((resolve, reject) => {
        const onError = (...args) => {
            cacheMap.delete(url);
            return reject(...args);
        };

        onLoadAndError(linkEl, resolve, async () => {
            cacheMap.delete(url);
            if (retryCount < assets.retries.count) {
                await new Promise((resolve) =>
                    setTimeout(
                        resolve,
                        assets.retries.delay + assets.retries.extraDelay * retryCount
                    )
                );
                linkEl.remove();
                loadCSS(url, { retryCount: retryCount + 1, targetDoc })
                    .then(resolve)
                    .catch(onError);
            } else {
                onError(new AssetsLoadingError(`The loading of ${url} failed`));
            }
        });
    });
    cacheMap.set(url, promise);
    targetDoc.head.appendChild(linkEl);
    return promise;
};

/**
 * Get the files information as descriptor object from a public asset template.
 *
 * @param {string} bundleName Name of the bundle containing the list of files
 * @returns {Promise<{cssLibs, jsLibs}>}
 */
assets.getBundle = async function getBundle(bundleName, targetDoc = document) {
    const cacheMap = getCacheMap(targetDoc);
    if (!cacheMap.has(bundleName)) {
        const url = new URL(`/web/bundle/${bundleName}`, location.origin);
        for (const [key, value] of Object.entries(session.bundle_params || {})) {
            url.searchParams.set(key, value);
        }
        const promise = new Promise((resolve, reject) => {
            browser
                .fetch(url.href)
                .then((response) => {
                    return response.json().then((json) => {
                        const assets = {
                            cssLibs: [],
                            jsLibs: [],
                        };
                        for (const key in json) {
                            const file = json[key];
                            if (file.type === "link" && file.src) {
                                assets.cssLibs.push(file.src);
                            } else if (file.type === "script" && file.src) {
                                assets.jsLibs.push(file.src);
                            }
                        }
                        resolve(assets);
                    });
                })
                .catch((...args) => {
                    cacheMap.delete(bundleName);
                    reject(...args);
                });
        });
        cacheMap.set(bundleName, promise);
    }
    return cacheMap.get(bundleName);
};

/**
 * Loads the given js/css libraries and asset bundles in the targetDoc. Note that no library or
 * asset will be loaded if it was already done before.
 *
 * @param {string} bundleName
 * @param {Object} options
 * @param {Document} [options.targetDoc=document]
 * @param {Boolean} [options.css=true] if true, we load css bundle
 * @param {Boolean} [options.js=true] if true, we load js bundle
 * @returns {Promise[]}
 */
assets.loadBundle = async function loadBundle(
    bundleName,
    { targetDoc = document, css = true, js = true } = {}
) {
    if (typeof bundleName === "string") {
        const desc = await assets.getBundle(bundleName);
        const promises = [];
        if (css && desc.cssLibs) {
            promises.push(...desc.cssLibs.map((url) => assets.loadCSS(url, { targetDoc })));
        }
        if (js && desc.jsLibs) {
            promises.push(...desc.jsLibs.map((url) => assets.loadJS(url, targetDoc)));
        }
        return Promise.all(promises);
    } else {
        throw new Error(
            `loadBundle(bundleName:string) accepts only bundleName argument as a string ! Not ${JSON.stringify(
                bundleName
            )} as ${typeof bundleName}`
        );
    }
};

export const loadJS = function (url, targetDoc = document) {
    return assets.loadJS(url, targetDoc);
};
export const loadCSS = function (url, targetDoc = document) {
    return assets.loadCSS(url, { targetDoc });
};
export const getBundle = function (bundleName) {
    return assets.getBundle(bundleName);
};
export const loadBundle = function (
    bundleName,
    { targetDoc = document, css = true, js = true } = {}
) {
    return assets.loadBundle(bundleName, { targetDoc, css, js });
};

/**
 * Utility component that loads an asset bundle before instanciating a component
 */
export class LazyComponent extends Component {
    static template = xml`<t t-component="Component" t-props="props.props"/>`;
    static props = {
        Component: String,
        bundle: String,
        props: { type: Object, optional: true },
    };
    setup() {
        onWillStart(async () => {
            await loadBundle(this.props.bundle);
            this.Component = registry.category("lazy_components").get(this.props.Component);
        });
    }
}
