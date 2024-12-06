export const session = odoo.__session_info__ || {};
delete odoo.__session_info__;
export async function lazySessionInfo() {
    const response = await fetch("/web/session/lazy_session_info");
    const lazySession = await response.json();
    Object.assign(session, lazySession);
}
