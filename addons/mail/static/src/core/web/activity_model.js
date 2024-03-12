import { Record } from "@mail/core/common/record";
import { assignDefined } from "@mail/utils/common/misc";
import { _t } from "@web/core/l10n/translation";

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
 * @property {string} date_done
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
    static id = "id";
    /** @type {Object.<number, import("models").Activity>} */
    static records = {};
    /** @returns {import("models").Activity} */
    static get(data) {
        return super.get(data);
    }
    /**
     * @param {Data} data
     * @param {Object} [param1]
     * @param {boolean} param1.broadcast
     * @returns {import("models").Activity|import("models").Activity[]}
     */
    static insert(data, { broadcast = true } = {}) {
        return super.insert(...arguments);
    }
    /**
     * @param {Data} data
     * @param {Object} [param1]
     * @param {boolean} param1.broadcast
     * @returns {import("models").Activity}
     */
    static _insert(data, { broadcast = true } = {}) {
        /** @type {import("models").Activity} */
        const activity = this.preinsert(data);
        if (data.request_partner_id) {
            data.request_partner_id = data.request_partner_id[0];
        }
        if (!data.icon) {
            data.icon = "fa-tasks";
        }
        assignDefined(activity, data);
        if (broadcast) {
            this.store.env.services["multi_tab"].broadcast(
                "mail.activity/insert",
                activity.serialize()
            );
        }
        return activity;
    }

    /** @type {boolean} */
    active;
    /** @type {string} */
    activity_category;
    /** @type {[number, string]} */
    activity_type_id;
    /** @type {string|false} */
    activity_decoration;
    /** @type {Object[]} */
    attachment_ids;
    /** @type {boolean} */
    can_write;
    /** @type {'suggest'|'trigger'} */
    chaining_type;
    /** @type {luxon.DateTime} */
    create_date = Record.attr(undefined, { type: "datetime" });
    /** @type {[number, string]} */
    create_uid;
    /** @type {luxon.DateTime} */
    date_deadline = Record.attr(undefined, { type: "date" });
    /** @type {luxon.DateTime} */
    date_done = Record.attr(undefined, { type: "date" });
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
    note = Record.attr("", { html: true });
    persona = Record.one("Persona");
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

    get dateDeadlineFormatted() {
        return this.date_deadline.toLocaleString(luxon.DateTime.DATE_SHORT);
    }

    get dateDoneFormatted() {
        return this.date_done.toLocaleString(luxon.DateTime.DATE_SHORT);
    }

    get dateCreateFormatted() {
        return this.create_date.toLocaleString(luxon.DateTime.DATETIME_SHORT);
    }

    async edit() {
        return new Promise((resolve) =>
            this.store.env.services.action.doAction(
                {
                    type: "ir.actions.act_window",
                    name: _t("Schedule Activity"),
                    res_model: "mail.activity",
                    view_mode: "form",
                    views: [[false, "form"]],
                    target: "new",
                    res_id: this.id,
                },
                { onClose: resolve }
            )
        );
    }

    /** @param {number[]} attachmentIds */
    async markAsDone(attachmentIds = []) {
        await this.store.env.services.orm.call("mail.activity", "action_feedback", [[this.id]], {
            attachment_ids: attachmentIds,
            feedback: this.feedback,
        });
        this.store.env.services["multi_tab"].broadcast("mail.activity/reload_chatter", {
            id: this.res_id,
            model: this.res_model,
        });
    }

    async markAsDoneAndScheduleNext() {
        const action = await this.store.env.services.orm.call(
            "mail.activity",
            "action_feedback_schedule_next",
            [[this.id]],
            { feedback: this.feedback }
        );
        this.store.env.services["multi_tab"].broadcast("mail.activity/reload_chatter", {
            id: this.res_id,
            model: this.res_model,
        });
        return action;
    }

    remove({ broadcast = true } = {}) {
        this.delete();
        if (broadcast) {
            this.store.env.services["multi_tab"].broadcast("mail.activity/delete", {
                id: this.res_id,
            });
        }
    }

    serialize() {
        return JSON.parse(JSON.stringify(this.toData()));
    }
}

Activity.register();
