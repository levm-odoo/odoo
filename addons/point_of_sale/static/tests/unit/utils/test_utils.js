/** @odoo-module **/

export function removeSpace(string) {
    return string.replace(/\s+/g, ' ').trim();
}
