const originalSession = odoo.__session_info__ || {};
delete odoo.__session_info__;
const lazySession = {};
let hasLazyLoad = false;
const promises = [];
export const session = new Proxy(
    {},
    {
        get: (target, p) => {
            if (p in originalSession) {
                return originalSession[p];
            }
            if (p in lazySession) {
                if (hasLazyLoad) {
                    return Reflect.get(lazySession, p);
                }
                const prom = new Promise((resole) => {
                    resole(Reflect.get(lazySession, p));
                });
                promises.push(prom);
                return prom;
            }
            // throw new Error(
            //     `could not access session parameter "${p}": parameters are not ready yet.`
            // );
        },
    }
);
export async function lazySessionInfo() {
    const response = await fetch("/web/session/lazy_session_info");
    const lasySessionResponse = await response.json();
    Object.assign(lazySession, lasySessionResponse);
    promises.forEach((promise) => promise.resolve());
    promises.length = 0;
    hasLazyLoad = true;
}
