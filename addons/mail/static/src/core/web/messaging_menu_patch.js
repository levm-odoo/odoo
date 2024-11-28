import { MessagingMenu } from "@mail/core/public_web/messaging_menu";
import { onExternalClick, useLoadMore } from "@mail/utils/common/hooks";
import { useEffect, useState } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { MessagingMenuQuickSearch } from "@mail/core/web/messaging_menu_quick_search";
import { rpc } from "@web/core/network/rpc";

Object.assign(MessagingMenu.components, { MessagingMenuQuickSearch });

patch(MessagingMenu.prototype, {
    setup() {
        super.setup();
        this.action = useService("action");
        this.pwa = useState(useService("pwa"));
        this.notification = useState(useService("mail.notification.permission"));
        Object.assign(this.state, {
            searchOpen: false,
            allLoaded: false,
        });
        this.lastLoad = { offset: undefined, from_important: undefined, all_loaded: false };
        this.loadMore = useLoadMore("load-more", {
            fn: () => this.load(),
            ready: false,
        });

        onExternalClick("selector", () => Object.assign(this.state, { adding: false }));
        useEffect(
            () => {
                if (
                    this.store.discuss.searchTerm &&
                    this.lastSearchTerm !== this.store.discuss.searchTerm &&
                    this.state.activeIndex
                ) {
                    this.state.activeIndex = 0;
                }
                if (!this.store.discuss.searchTerm) {
                    this.state.activeIndex = null;
                }
                this.lastSearchTerm = this.store.discuss.searchTerm;
            },
            () => [this.store.discuss.searchTerm]
        );
        useEffect(
            () => {
                if (!this.dropdown.isOpen) {
                    this.state.activeIndex = null;
                }
            },
            () => [this.dropdown.isOpen]
        );
    },
    beforeOpen() {
        this.state.searchOpen = false;
        this.store.discuss.searchTerm = "";
        this.store.isReady.then(() => {
            if (
                !this.store.inbox.isLoaded &&
                this.store.inbox.status !== "loading" &&
                this.store.inbox.counter !== this.store.inbox.messages.length
            ) {
                this.store.inbox.fetchNewMessages();
            }
        });
        this.load().then(() => (this.loadMore.ready = true));
    },
    async load() {
        const { storeData, ...otherData } = await rpc("/discuss/pinned_channels/load", {
            offset: this.lastLoad.offset,
            from_important: this.lastLoad.from_important,
        });
        this.lastLoad = { ...otherData };
        if (this.lastLoad.all_loaded) {
            this.state.allLoaded = true;
        }
        this.store.insert(storeData, { html: true });
    },
    get canPromptToInstall() {
        return this.pwa.canPromptToInstall;
    },
    get hasPreviews() {
        return (
            this.threads.length > 0 ||
            (this.store.failures.length > 0 &&
                this.store.discuss.activeTab === "main" &&
                !this.env.inDiscussApp) ||
            (this.shouldAskPushPermission &&
                this.store.discuss.activeTab === "main" &&
                !this.env.inDiscussApp) ||
            (this.canPromptToInstall &&
                this.store.discuss.activeTab === "main" &&
                !this.env.inDiscussApp)
        );
    },
    get installationRequest() {
        return {
            body: _t("Come here often? Install Odoo on your device!"),
            displayName: _t("%s has a suggestion", this.store.odoobot.name),
            onClick: () => {
                this.pwa.show();
            },
            iconSrc: this.store.odoobot.avatarUrl,
            partner: this.store.odoobot,
            isShown: this.store.discuss.activeTab === "main" && this.canPromptToInstall,
        };
    },
    get notificationRequest() {
        return {
            body: _t("Enable desktop notifications to chat"),
            displayName: _t("%s has a request", this.store.odoobot.name),
            iconSrc: this.store.odoobot.avatarUrl,
            partner: this.store.odoobot,
            isShown: this.store.discuss.activeTab === "main" && this.shouldAskPushPermission,
        };
    },
    get tabs() {
        return [
            {
                icon: this.env.inDiscussApp ? "fa fa-inbox" : "fa fa-envelope",
                id: "main",
                label: this.env.inDiscussApp ? _t("Mailboxes") : _t("All"),
            },
            ...super.tabs,
        ];
    },
    /** @param {import("models").Failure} failure */
    onClickFailure(failure) {
        const threadIds = new Set(
            failure.notifications.map(({ mail_message_id: message }) => message.thread.id)
        );
        if (threadIds.size === 1) {
            const message = failure.notifications[0].mail_message_id;
            this.openThread(message.thread);
        } else {
            this.openFailureView(failure);
            this.dropdown.close();
        }
    },
    openThread(thread) {
        if (this.store.discuss.isActive) {
            this.action.doAction({
                type: "ir.actions.act_window",
                res_model: thread.model,
                views: [[false, "form"]],
                res_id: thread.id,
            });
            // Close the related chat window as having both the form view
            // and the chat window does not look good.
            this.store.ChatWindow.get({ thread })?.close();
        } else {
            thread.open({ fromMessagingMenu: true });
        }
        this.dropdown.close();
    },
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
    },
    cancelNotifications(failure) {
        return this.env.services.orm.call(failure.resModel, "notify_cancel_by_type", [], {
            notification_type: failure.type,
        });
    },
    toggleSearch() {
        this.store.discuss.searchTerm = "";
        this.state.searchOpen = !this.state.searchOpen;
    },
    get counter() {
        let value =
            this.store.inbox.counter +
            this.store.failures.reduce((acc, f) => acc + parseInt(f.notifications.length), 0);
        if (this.canPromptToInstall) {
            value++;
        }
        if (this.shouldAskPushPermission) {
            value++;
        }
        return value;
    },
    get shouldAskPushPermission() {
        return this.notification.permission === "prompt";
    },
});
