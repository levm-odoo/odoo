/** @odoo-module **/

export const standardFieldProps = {
    archs: { type: [Object, Boolean], optional: true }, // FIXME WOWL remove this
    id: { type: String, optional: true },
    name: { type: String, optional: true },
    readonly: { type: Boolean, optional: true },
    record: { type: Object, optional: true },
    type: { type: String, optional: true },
    update: { type: Function, optional: true },
    value: true,
    decorations: { type: Object, optional: true },
};
