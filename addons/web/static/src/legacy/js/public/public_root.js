import dom from '@web/core/dom';
import { cookie } from "@web/core/browser/cookie";
import publicWidget from '@web/legacy/js/public/public_widget';
import { registry } from '@web/core/registry';

import lazyloader from "@web/legacy/js/public/lazyloader";

import { makeEnv, startServices } from "@web/env";
import { getTemplate } from '@web/core/templates';
import { MainComponentsContainer } from "@web/core/main_components_container";
import { browser } from '@web/core/browser/browser';
import { _t } from "@web/core/l10n/translation";
import { App, Component, whenReady } from "@odoo/owl";
import { RPCError } from '@web/core/network/rpc';

const { Settings } = luxon;

// Load localizations outside the PublicRoot to not wait for DOM ready (but
// wait for them in PublicRoot)
function getLang() {
    var html = document.documentElement;
    return (html.getAttribute('lang') || 'en_US').replace('-', '_');
}
const lang = cookie.get('frontend_lang') || getLang(); // FIXME the cookie value should maybe be in the ctx?


/**
 * Element which is designed to be unique and that will be the top-most element
 * in the widget hierarchy. So, all other widgets will be indirectly linked to
 * this Class instance. Its main role will be to retrieve RPC demands from its
 * children and handle them.
 */
export const PublicRoot = publicWidget.RootWidget.extend({
    events: Object.assign({}, publicWidget.RootWidget.prototype.events || {}, {
        'submit .js_website_submit_form': '_onWebsiteFormSubmit',
        'click .js_disable_on_click': '_onDisableOnClick',
    }),
    custom_events: Object.assign({}, publicWidget.RootWidget.prototype.custom_events || {}, {
        call_service: '_onCallService',
        context_get: '_onContextGet',
        main_object_request: '_onMainObjectRequest',
        widgets_start_request: '_onWidgetsStartRequest',
        widgets_stop_request: '_onWidgetsStopRequest',
    }),

    /**
     * @constructor
     */
    init: function (_, env) {
        this._super.apply(this, arguments);
        this.env = env;
        this.publicWidgets = [];
    },
    /**
     * @override
     */
    start: function () {
        var defs = [
            this._super.apply(this, arguments),
            this._startWidgets()
        ];

        // Display image thumbnail
        this.el.querySelectorAll(".o_image[data-mimetype^='image']").forEach(function () {
            var imgEl = this;
            if (/gif|jpe|jpg|png|webp/.test(imgEl.dataset.mimetype) && imgEl.data('src')) {
                imgEl.css('background-image', "url('" + imgEl.data('src') + "')");
            }
        });

        // Auto scroll
        if (window.location.hash.indexOf("scrollTop=") > -1) {
            this.el.scrollTop = +window.location.hash.match(/scrollTop=([0-9]+)/)[1];
        }

        return Promise.all(defs);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Retrieves the global context of the public environment. This is the
     * context which is automatically added to each RPC.
     *
     * @private
     * @param {Object} [context]
     * @returns {Object}
     */
    _getContext: function (context) {
        return Object.assign({
            'lang': getLang(),
        }, context || {});
    },
    /**
     * Retrieves the global context of the public environment (as
     * @see _getContext) but with extra informations that would be useless to
     * send with each RPC.
     *
     * @private
     * @param {Object} [context]
     * @returns {Object}
     */
    _getExtraContext: function (context) {
        return this._getContext(context);
    },
    /**
     * @private
     * @param {Object} [options]
     * @returns {Object}
     */
    _getPublicWidgetsRegistry: function (options) {
        return publicWidget.registry;
    },
    /**
     * As the root instance is designed to be unique, the associated
     * registry has been instantiated outside of the class and is simply
     * returned here.
     *
     * @private
     * @override
     */
    _getRegistry: function () {
        return registry.category("public_root_widgets");
    },
    /**
     * Creates an PublicWidget instance for each DOM element which matches the
     * `selector` key of one of the registered widgets
     * (@see PublicWidget.selector).
     *
     * @private
     * @param {HTMLElement} [fromEl]
     *        only initialize the public widgets whose `selector` matches the
     *        element or one of its descendant (default to the wrapwrap element)
     * @param {Object} [options]
     * @returns {Deferred}
     */
    _startWidgets: function (fromEl, options) {
        var self = this;

        if (fromEl === undefined) {
            fromEl = this.el?.querySelectorAll("#wrapwrap");
            if (!fromEl.length) {
                // TODO Remove this once all frontend layouts possess a
                // #wrapwrap element (which is necessary for those pages to be
                // adapted correctly if the user installs website).
                fromEl = this.el;
            }
        }
        options = Object.assign({}, options, {
            // TODO: here wysiwyg is not stored as data attribute
            // it's set by jquery data() method.
            wysiwyg: $('#wrapwrap').data('wysiwyg'),
        });
        this._stopWidgets(fromEl);
        var defs = Object.values(this._getPublicWidgetsRegistry(options)).map((PublicWidget) => {
            var selector = PublicWidget.prototype.selector || '';
            var targetEl = dom.cssFind(fromEl, selector, true);
            var defs = Array.from(targetEl).map((el) => {
                var widget = new PublicWidget(self, options);
                self.publicWidgets.push(widget);
                return widget.attachTo(el);
            });
            return Promise.all(defs);
        });
        return Promise.all(defs);
    },
    /**
     * Destroys all registered widget instances. Website would need this before
     * saving while in edition mode for example.
     *
     * @private
     * @param {Array|NodeList|Element} [fromEl]
     *        only stop the public widgets linked to the given element(s) or one
     *        of its descendants
     */
    _stopWidgets: function (fromEl) {
        var removedWidgets = this.publicWidgets.map((widget) => {
            // Check if fromEl is not provided,
            // or widget.el is a descendant of fromEl or matches fromEl directly
            if (!fromEl || fromEl.contains(widget.el) || fromEl === widget.el) {
                widget.destroy();
                return widget;
            }
            return null;
        });
        this.publicWidgets = this.publicWidgets.filter((x) => removedWidgets.indexOf(x) < 0);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Calls the requested service from the env. Automatically adds the global
     * context to RPCs.
     *
     * @private
     * @param {OdooEvent} event
     */
    _onCallService: function (ev) {
        const payload = ev.data;
        const service = this.env.services[payload.service];
        const result = service[payload.method].apply(service, payload.args || []);
        payload.callback(result);
        ev.stopPropagation();
    },
    /**
     * Called when someone asked for the global public context.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onContextGet: function (ev) {
        if (ev.data.extra) {
            ev.data.callback(this._getExtraContext(ev.data.context));
        } else {
            ev.data.callback(this._getContext(ev.data.context));
        }
    },
    /**
     * Checks information about the page main object.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onMainObjectRequest: function (ev) {
        var repr = document.querySelector("html").dataset["main-object"];
        var m = repr.match(/(.+)\((\d+),(.*)\)/);
        ev.data.callback({
            model: m[1],
            id: m[2] | 0,
        });
    },
    /**
     * Called when the root is notified that the public widgets have to be
     * (re)started.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onWidgetsStartRequest: function (ev) {
        const targetEl = ev.data.target instanceof jQuery ? ev.data.target[0] : ev.target.el;
        this._startWidgets(targetEl, ev.data.options)
            .then(ev.data.onSuccess)
            .catch((e) => {
                if (ev.data.onFailure) {
                    ev.data.onFailure(e);
                }
                if (!(e instanceof RPCError)) {
                    return Promise.reject(e);
                }
            });
    },
    /**
     * Called when the root is notified that the public widgets have to be
     * stopped.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onWidgetsStopRequest: function (ev) {
        const targetEl = ev.data.target instanceof jQuery ? ev.data.target[0] : ev.target.el;
        this._stopWidgets(targetEl);
    },
    /**
     * @todo review
     * @private
     */
    _onWebsiteFormSubmit: function (ev) {
        const buttonEl = ev.currentTarget.querySelector("button[type='submit']");
        if (buttonEl) {
            const icon = document.createElement("i");
            icon.className = "fa fa-circle-o-notch fa-spin";
            buttonEl.prepend(icon);
            buttonEl.disabled = true;
        }
    },
    /**
     * Called when the root is notified that the button should be
     * disabled after the first click.
     *
     * @private
     * @param {Event} ev
     */
    _onDisableOnClick: function (ev) {
        ev.currentTarget.classList.add("disabled");
    },
    /**
     * Library clears the wrong date format so just ignore error
     *
     * @private
     * @param {Event} ev
     */
    _onDateTimePickerError: function (ev) {
        return false;
    },
});

/**
 * This widget is important, because the tour manager needs a root widget in
 * order to work. The root widget must be a service provider with the ajax
 * service, so that the tour manager can let the server know when tours have
 * been consumed.
 */
export async function createPublicRoot(RootWidget) {
    await lazyloader.allScriptsLoaded;
    await whenReady();
    const env = makeEnv();
    await startServices(env);
    Component.env = env;
    await env.services.public_component.mountComponents();
    const publicRoot = new RootWidget(null, env);
    const app = new App(MainComponentsContainer, {
        getTemplate,
        env,
        dev: env.debug,
        translateFn: _t,
        translatableAttributes: ["data-tooltip"],
    });
    const language = lang || browser.navigator.language;
    const locale = language === "sr@latin" ? "sr-Latn-RS" : language.replace(/_/g, "-");
    Settings.defaultLocale = locale;
    const [root] = await Promise.all([
        app.mount(document.body),
        publicRoot.attachTo(document.body),
    ]);
    odoo.__WOWL_DEBUG__ = { root };
    return publicRoot;
}

export default { PublicRoot, createPublicRoot };
