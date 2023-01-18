/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useMessaging, useStore } from "../core/messaging_hook";
import { browser } from "@web/core/browser/browser";
import { PartnerImStatus } from "@mail/new/discuss/partner_im_status";
import { NotificationItem } from "./notification_item";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { createLocalId } from "../utils/misc";

export class MessagingMenu extends Component {
    static components = { Dropdown, NotificationItem, PartnerImStatus };
    static props = ["inDiscuss?"];
    static template = "mail.messaging_menu";

    setup() {
        this.messaging = useMessaging();
        this.store = useStore();
        this.chatWindowService = useState(useService("mail.chat_window"));
        this.threadService = useState(useService("mail.thread"));
        this.action = useService("action");
        this.state = useState({
            tab: this.props.inDiscuss ? "mailbox" : "all", // can be 'mailbox', 'all', 'channels' or 'chats'
        });
    }

    createLocalId(...args) {
        return createLocalId(...args);
    }

    /**
     * @param {'all' | 'chat' | 'group'} tab
     * @returns Thread types matching the given tab.
     */
    tabToThreadType(tab) {
        return tab === "chats" ? ["chat", "group"] : tab;
    }

    get displayedPreviews() {
        /** @type {import("@mail/new/core/thread_model").Thread[]} **/
        const threads = Object.values(this.store.threads);
        const previews = threads.filter((thread) => thread.is_pinned);

        const tab = this.state.tab;
        if (tab === "all") {
            return previews;
        }
        const target = this.tabToThreadType(tab);
        return previews.filter((preview) => target.includes(preview.type));
    }

    /**
     * @type {{ id: string, icon: string, label: string }[]}
     */
    get tabs() {
        if (this.props.inDiscuss) {
            return [
                {
                    icon: "fa fa-inbox",
                    id: "mailbox",
                    label: _t("Mailboxes"),
                },
                {
                    icon: "fa fa-user",
                    id: "chat",
                    label: _t("Chat"),
                },
                {
                    icon: "fa fa-users",
                    id: "channel",
                    label: _t("Channel"),
                },
            ];
        } else {
            return [
                {
                    icon: "fa fa-envelope",
                    id: "all",
                    label: _t("All"),
                },
                {
                    icon: "fa fa-user",
                    id: "chat",
                    label: _t("Chat"),
                },
                {
                    icon: "fa fa-users",
                    id: "channel",
                    label: _t("Channel"),
                },
            ];
        }
    }

    openDiscussion(thread) {
        this.threadService.open(thread);
        this.close();
    }

    onClickNewMessage() {
        this.chatWindowService.openNewMessage();
        this.close();
    }

    /**
     *
     * @param {import("@mail/new/core/notification_group_model").NotificationGroup} failure
     */
    onClickFailure(failure) {
        const originThreadIds = new Set(
            failure.notifications.map(({ message }) => message.originThread.id)
        );
        if (originThreadIds.size === 1) {
            const message = failure.notifications[0].message;
            if (!message.originThread.type) {
                this.threadService.update(message.originThread, { type: "chatter" });
            }
            if (this.store.discuss.isActive) {
                this.action.doAction({
                    type: "ir.actions.act_window",
                    res_model: message.originThread.model,
                    views: [[false, "form"]],
                    res_id: message.originThread.id,
                });
                // Close the related chat window as having both the form view
                // and the chat window does not look good.
                this.store.chatWindows
                    .find(({ thread }) => thread === message.originThread)
                    ?.close();
            } else {
                this.threadService.open(message.originThread);
            }
        } else {
            this.openFailureView(failure);
        }
        this.close();
    }

    openFailureView(failure) {
        if (failure.type !== "email") {
            return;
        }
        this.action.doAction({
            name: _t("Mail Failures"),
            type: "ir.actions.act_window",
            view_mode: "kanban,list,form",
            views: [
                [false, "kanban"],
                [false, "list"],
                [false, "form"],
            ],
            target: "current",
            res_model: failure.resModel,
            domain: [["message_has_error", "=", true]],
            context: { create: false },
        });
    }

    cancelNotifications(failure) {
        return this.env.services.orm.call(failure.resModel, "notify_cancel_by_type", [], {
            notification_type: failure.type,
        });
    }

    close() {
        // hack: click on window to close dropdown, because we use a dropdown
        // without dropdownitem...
        document.body.click();
    }

    onClickNavTab(tabId) {
        if (this.props.inDiscuss) {
            if (this.store.discuss.activeTab === tabId) {
                return;
            }
            this.store.discuss.activeTab = tabId;
            this.state.tab = tabId;
            if (
                this.store.discuss.activeTab === "mailbox" &&
                (!this.store.discuss.threadLocalId ||
                    this.store.threads[this.store.discuss.threadLocalId].type !== "mailbox")
            ) {
                this.threadService.setDiscussThread(
                    Object.values(this.store.threads).find((thread) => thread.id === "inbox")
                );
            }
            if (this.store.discuss.activeTab !== "mailbox") {
                this.store.discuss.threadLocalId = null;
            }
        } else {
            this.state.tab = tabId;
        }
    }

    get counter() {
        let value =
            this.store.discuss.inbox.counter +
            Object.values(this.store.threads).filter(
                (thread) => thread.is_pinned && thread.isUnread
            ).length +
            Object.values(this.store.notificationGroups).reduce(
                (acc, ng) => acc + parseInt(Object.values(ng.notifications).length),
                0
            );
        if (browser.Notification?.permission === "default") {
            value++;
        }
        return value;
    }
}
