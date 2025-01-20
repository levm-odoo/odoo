import { threadActionsRegistry } from "@mail/core/common/thread_actions";
import "@mail/discuss/call/common/thread_actions";

import { _t } from "@web/core/l10n/translation";

threadActionsRegistry.add("restart", {
    condition(component) {
        return component.thread.chatbot?.canRestart;
    },
    icon: "fa fa-fw fa-refresh",
    name: _t("Restart Conversation"),
    open(component) {
        component.thread.chatbot.restart();
        component.props.chatWindow.open();
    },
    sequence: 99,
    sequenceQuick: 15,
});
