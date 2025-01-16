export const session = odoo.__session_info__ || {};
delete odoo.__session_info__;

let loaded = false;
const lazyConfig = {};
const promises = [];
export async function lazyLoadConfig() {
    const response = await fetch("/web/session/lazy_session_info");
    const lazySession = await response.json();
    Object.assign(lazyConfig, lazySession);
    promises.forEach((promise) => promise());
    promises.length = 0;
    loaded = true;
}

export function getLazyConfig() {
    return new Promise((resolve) => {
        if (loaded) {
            resolve(lazyConfig);
        } else {
            promises.push(() => resolve(lazyConfig));
        }
    });
}
