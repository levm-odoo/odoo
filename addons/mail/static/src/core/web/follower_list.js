import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { FollowerSubtypeDialog } from "./follower_subtype_dialog";
import { useVisible } from "@mail/utils/common/hooks";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

/**
 * @typedef {Object} Props
 * @property {function} [onAddFollowers]
 * @property {function} [onFollowerChanged]
 * @property {import('@mail/core/common/thread_model').Thread} thread
 * @extends {Component<Props, Env>}
 */

export class FollowerList extends Component {
    static template = "mail.FollowerList";
    static components = { DropdownItem };
    static props = ["onAddFollowers?", "onFollowerChanged?", "thread", "dropdown"];

    setup() {
        super.setup();
        this.action = useService("action");
        this.store = useState(useService("mail.store"));
        useVisible("load-more", (isVisible) => {
            if (isVisible) {
                this.props.thread.loadMoreFollowers();
            }
        });
        this.dialogService = useService("dialog");
    }

    onClickAddFollowers() {
        const options = {
            resModel: "mail.wizard.invite",
            title: _t("Add Followers to this document"),
            context: {
                default_res_model: this.props.thread.model,
                default_res_id: this.props.thread.id,
            },
        };
        this.dialogService.add(FormViewDialog, options, {
            onClose: () => {
                this.props.onAddFollowers?.();
            },
        })
        // this.action.doAction(action, {
        //     onClose: () => {
        //         this.props.onAddFollowers?.();
        //     },
        // });
    }

    /**
     * @param {MouseEvent} ev
     * @param {import("models").Follower} follower
     */
    onClickDetails(ev, follower) {
        this.store.openDocument({ id: follower.partner.id, model: "res.partner" });
        this.props.dropdown.close();
    }

    /**
     * @param {MouseEvent} ev
     * @param {import("models").Follower} follower
     */
    async onClickEdit(ev, follower) {
        this.env.services.dialog.add(FollowerSubtypeDialog, {
            follower,
            onFollowerChanged: () => this.props.onFollowerChanged?.(this.props.thread),
        });
        this.props.dropdown.close();
    }

    /**
     * @param {MouseEvent} ev
     * @param {import("models").Follower} follower
     */
    async onClickRemove(ev, follower) {
        const thread = this.props.thread;
        await follower.remove();
        this.props.onFollowerChanged?.(thread);
    }
}
