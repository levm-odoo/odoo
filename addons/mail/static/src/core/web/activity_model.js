/* @odoo-module */

import { Record, modelRegistry } from "@mail/core/common/record";
import { assignDefined } from "@mail/utils/common/misc";

/**
 * @typedef Data
 * @property {string} activity_category
 * @property {[number, string]} activity_type_id
 * @property {string|false} activity_decoration
 * @property {boolean} can_write
 * @property {'suggest'|'trigger'} chaining_type
 * @property {string} create_date
 * @property {[number, string]} create_uid
 * @property {string} date_deadline
 * @property {string} display_name
 * @property {boolean} has_recommended_activities
 * @property {string} icon
 * @property {number} id
 * @property {Object[]} mail_template_ids
 * @property {string} note
 * @property {number|false} previous_activity_type_id
 * @property {number|false} recommended_activity_type_id
 * @property {string} res_model
 * @property {[number, string]} res_model_id
 * @property {number} res_id
 * @property {string} res_name
 * @property {number|false} request_partner_id
 * @property {'overdue'|'planned'|'today'} state
 * @property {string} summary
 * @property {[number, string]} user_id
 * @property {string} write_date
 * @property {[number, string]} write_uid
 */

export class Activity extends Record {
    /** @type {Object.<number, Activity>} */
    static records = {};

    /**
     * @param {Data} data
     * @param {Object} [param1]
     * @param {boolean} param1.broadcast
     * @returns {Activity}
     */
    static insert(data, { broadcast = true } = {}) {
        let activity = this.records[data.id];
        if (!activity) {
            activity = new Activity();
            Object.assign(activity, {
                id: data.id,
                _store: this.store,
            });
            this.store.Activity.records[data.id] = activity;
            // return reactive
            activity = this.store.Activity.records[data.id];
        }
        if (data.request_partner_id) {
            data.request_partner_id = data.request_partner_id[0];
        }
        assignDefined(activity, data);
        if (broadcast) {
            this.env.services["mail.activity"].broadcastChannel?.postMessage({
                type: "insert",
                payload: this.env.services["mail.activity"]._serialize(activity),
            });
        }
        return activity;
    }

    /** @type {string} */
    activity_category;
    /** @type {[number, string]} */
    activity_type_id;
    /** @type {string|false} */
    activity_decoration;
    /** @type {boolean} */
    can_write;
    /** @type {'suggest'|'trigger'} */
    chaining_type;
    /** @type {string} */
    create_date;
    /** @type {[number, string]} */
    create_uid;
    /** @type {string} */
    date_deadline;
    /** @type {string} */
    display_name;
    /** @type {boolean} */
    has_recommended_activities;
    /** @type {string} */
    feedback;
    /** @type {string} */
    icon;
    /** @type {number} */
    id;
    /** @type {Object[]} */
    mail_template_ids;
    /** @type {string} */
    note;
    /** @type {number|false} */
    previous_activity_type_id;
    /** @type {number|false} */
    recommended_activity_type_id;
    /** @type {string} */
    res_model;
    /** @type {[number, string]} */
    res_model_id;
    /** @type {number} */
    res_id;
    /** @type {string} */
    res_name;
    /** @type {number|false} */
    request_partner_id;
    /** @type {'overdue'|'planned'|'today'} */
    state;
    /** @type {string} */
    summary;
    /** @type {[number, string]} */
    user_id;
    /** @type {string} */
    write_date;
    /** @type {[number, string]} */
    write_uid;
    /** @type {import("@mail/core/common/store_service").Store} */
    _store;
}

modelRegistry.add(Activity.name, Activity);
