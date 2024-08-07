import { threadActionsRegistry } from "@mail/core/common/thread_actions";
import { AttachmentPanel } from "@mail/discuss/core/common/attachment_panel";
import { ChannelInvitation } from "@mail/discuss/core/common/channel_invitation";
import { ChannelMemberList } from "@mail/discuss/core/common/channel_member_list";
import { NotificationSettings } from "@mail/discuss/core/common/notification_settings";

import { useComponent } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";

threadActionsRegistry
    .add("join-channel", {
        condition(component) {
            return (
                component.thread?.hasMemberList &&
                !component.thread?.hasSelfAsMember &&
                component.store.self.type !== "guest"
            );
        },
        icon: "fa fa-fw fa-sign-in",
        iconLarge: "fa fa-fw fa-lg fa-sign-in",
        name: _t("Join channel"),
        open(component) {
            component.store.joinChannel(component.thread.id, component.thread.name);
        },
        sequence: 2,
    })
    .add("notification-settings", {
        condition(component) {
            return (
                component.thread?.model === "discuss.channel" &&
                component.store.self.type !== "guest" &&
                (!component.props.chatWindow || component.props.chatWindow.isOpen)
            );
        },
        setup(action) {
            const component = useComponent();
            if (!component.props.chatWindow) {
                action.popover = usePopover(NotificationSettings, {
                    onClose: () => action.close(),
                    position: "bottom-end",
                    fixedPosition: true,
                    popoverClass: action.panelOuterClass,
                });
            }
        },
        open(component, action) {
            action.popover?.open(component.root.el.querySelector(`[name="${action.id}"]`), {
                hasSizeConstraints: true,
                thread: component.thread,
            });
        },
        close(component, action) {
            action.popover?.close();
        },
        component: NotificationSettings,
        icon(component) {
            return component.thread.mute_until_dt
                ? "fa fa-fw text-danger fa-bell-slash"
                : "fa fa-fw fa-bell";
        },
        iconLarge(component) {
            return component.thread.mute_until_dt
                ? "fa fa-fw fa-lg text-danger fa-bell-slash"
                : "fa fa-fw fa-lg fa-bell";
        },
        name: _t("Notification Settings"),
        sequence: (component) => (component.props.chatWindow ? 16.5 : 5),
        toggle: true,
    })
    .add("attachments", {
        condition: (component) =>
            component.thread?.hasAttachmentPanel &&
            (!component.props.chatWindow || component.props.chatWindow.isOpen),
        component: AttachmentPanel,
        icon: "fa fa-fw fa-paperclip",
        iconLarge: "fa fa-fw fa-lg fa-paperclip",
        name: _t("Show Attachments"),
        nameActive: _t("Hide Attachments"),
        sequence: 25,
        toggle: true,
    })
    .add("add-users", {
        close(component, action) {
            action.popover?.close();
        },
        component: ChannelInvitation,
        componentProps(action) {
            return { close: () => action.close() };
        },
        condition(component) {
            return (
                component.thread?.model === "discuss.channel" &&
                (!component.props.chatWindow || component.props.chatWindow.isOpen)
            );
        },
        panelOuterClass: "o-discuss-ChannelInvitation",
        icon: "fa fa-fw fa-user-plus",
        iconLarge: "fa fa-fw fa-lg fa-user-plus",
        name: _t("Add Users"),
        nameActive: _t("Stop Adding Users"),
        open(component, action) {
            action.popover?.open(component.root.el.querySelector(`[name="${action.id}"]`), {
                hasSizeConstraints: true,
                thread: component.thread,
            });
        },
        sequence: 30,
        setup(action) {
            const component = useComponent();
            if (!component.props.chatWindow) {
                action.popover = usePopover(ChannelInvitation, {
                    onClose: () => action.close(),
                    popoverClass: action.panelOuterClass,
                });
            }
        },
        toggle: true,
    })
    .add("member-list", {
        component: ChannelMemberList,
        condition(component) {
            return (
                component.thread?.hasMemberList &&
                (!component.props.chatWindow || component.props.chatWindow.isOpen)
            );
        },
        componentProps(action, component) {
            return {
                openChannelInvitePanel({ keepPrevious } = {}) {
                    component.threadActions.actions
                        .find(({ id }) => id === "add-users")
                        ?.open({ keepPrevious });
                },
            };
        },
        panelOuterClass: "o-discuss-ChannelMemberList",
        icon: "fa fa-fw fa-users",
        iconLarge: "fa fa-fw fa-lg fa-users",
        name: _t("Show Member List"),
        nameActive: _t("Hide Member List"),
        sequence: 40,
        toggle: true,
    });
