/* @odoo-module */

import { Component, onMounted, useExternalListener, useRef, useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

export class ActivityMarkAsDone extends Component {
    static template = "mail.ActivityMarkAsDone";
    static props = ["activity", "close?", "hasHeader?", "onClickDoneAndScheduleNext?", "reload?"];
    static defaultProps = {
        hasHeader: false,
    };

    get isSuggested() {
        return this.props.activity.chaining_type === "suggest";
    }

    setup() {
        this.threadService = useState(useService("mail.thread"));
        this.textArea = useRef("textarea");
        onMounted(() => {
            this.textArea.el.focus();
        });
        useExternalListener(window, "keydown", this.onKeydown);
    }

    onKeydown(ev) {
        if (ev.key === "Escape" && this.props.close) {
            this.props.close();
        }
    }

    async onClickDone() {
        await this.env.services["mail.activity"].markAsDone(this.props.activity);
        if (this.props.reload) {
            this.props.reload();
        }
    }

    async onClickDoneAndScheduleNext() {
        if (this.props.onClickDoneAndScheduleNext) {
            this.props.onClickDoneAndScheduleNext();
        }
        if (this.props.close) {
            this.props.close();
        }
        const action = await this.env.services["mail.activity"].markAsDoneAndScheduleNext(
            this.props.activity
        );
        if (this.props.reload) {
            this.props.reload();
        }
        if (!action) {
            return;
        }
        await new Promise((resolve) => {
            this.env.services.action.doAction(action, {
                onClose: resolve,
            });
        });
        if (this.props.reload) {
            this.props.reload();
        }
    }
}
