import {
    click,
    contains,
    defineMailModels,
    mockGetMedia,
    onRpcBefore,
    openDiscuss,
    patchUiSize,
    SIZES,
    start,
    startServer,
    triggerEvents,
} from "@mail/../tests/mail_test_helpers";
import { mailDataHelpers } from "@mail/../tests/mock_server/mail_mock_server";

import { describe, expect, test } from "@odoo/hoot";
import { hover, queryFirst } from "@odoo/hoot-dom";
import { mockUserAgent } from "@odoo/hoot-mock";
import { EventBus } from "@odoo/owl";
import {
    asyncStep,
    Command,
    mockService,
    patchWithCleanup,
    serverState,
    waitForSteps,
} from "@web/../tests/web_test_helpers";

import { browser } from "@web/core/browser/browser";
import { isMobileOS } from "@web/core/browser/feature_detection";

describe.current.tags("desktop");
defineMailModels();

test("basic rendering", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await contains(".o-discuss-Call");
    await contains(".o-discuss-CallParticipantCard[aria-label='Mitchell Admin']");
    await contains(".o-discuss-CallActionList");
    await contains(".o-discuss-CallMenu-buttonContent");
    await contains(".o-discuss-CallActionList button", { count: 6 });
    await contains("button[aria-label='Unmute'], button[aria-label='Mute']"); // FIXME depends on current browser permission
    await contains(".o-discuss-CallActionList button[aria-label='Deafen']");
    await contains(".o-discuss-CallActionList button[aria-label='Turn camera on']");
    await contains(".o-discuss-CallActionList button[aria-label='Share Screen']");
    await contains("[title='More']");
    await contains(".o-discuss-CallActionList button[aria-label='Disconnect']");
    await click("[title='More']");
    await contains("[title='Raise Hand']");
    await contains("[title='Enter Full Screen']");
    // screen sharing not available in mobile OS
    mockUserAgent("Chrome/0.0.0 Android (OdooMobile; Linux; Android 13; Odoo TestSuite)");
    expect(isMobileOS()).toBe(true);
    await contains("[title='Share Screen']", { count: 0 });
});

test("keep the `more` popover active when hovering it", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await contains(".o-discuss-Call");
    await contains(".o-discuss-CallActionList");
    await click("[title='More']");
    const enterFullScreenSelector = ".o-dropdown-item[title='Enter Full Screen']";
    await contains(enterFullScreenSelector);
    await hover(queryFirst(enterFullScreenSelector));
    await contains(enterFullScreenSelector);
});

test("no call with odoobot", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: serverState.partnerId }),
            Command.create({ partner_id: serverState.odoobotId }),
        ],
        channel_type: "chat",
    });
    await start();
    await openDiscuss(channelId);
    await contains(".o-mail-Discuss-header");
    await contains("[title='Start a Call']", { count: 0 });
});

test("should not display call UI when no more members (self disconnect)", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await contains(".o-discuss-Call");
    await click(".o-discuss-CallActionList button[aria-label='Disconnect']");
    await contains(".o-discuss-Call", { count: 0 });
});

test("show call UI in chat window when in call", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-NotificationItem", { text: "General" });
    await contains(".o-mail-ChatWindow");
    await contains(".o-discuss-Call", { count: 0 });
    await click(".o-mail-ChatWindow-command[title='Start a Call']");
    await contains(".o-discuss-Call");
    await contains(".o-mail-ChatWindow-command[title='Start a Call']", { count: 0 });
});

test("should disconnect when closing page while in call", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    patchWithCleanup(browser, {
        navigator: {
            ...browser.navigator,
            sendBeacon: async (route, data) => {
                if (data instanceof Blob && route === "/mail/rtc/channel/leave_call") {
                    const blobText = await data.text();
                    const blobData = JSON.parse(blobText);
                    asyncStep(`sendBeacon_leave_call:${blobData.params.channel_id}`);
                }
            },
            serviceWorker: {
                controller: {
                    postMessage(data) {
                        if (data.name === "UNEXPECTED_CALL_TERMINATION") {
                            asyncStep(`postMessage:${data.name}:${data.channelId}`);
                        }
                    },
                },
            },
        },
    });

    await click("[title='Start a Call']");
    await contains(".o-discuss-Call");
    // simulate page close
    window.dispatchEvent(new Event("pagehide"), { bubble: true });
    await waitForSteps([
        `postMessage:UNEXPECTED_CALL_TERMINATION:${channelId}`,
        `sendBeacon_leave_call:${channelId}`,
    ]);
});

test("should display invitations", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    const partnerId = pyEnv["res.partner"].create({ name: "InvitationSender" });
    const memberId = pyEnv["discuss.channel.member"].create({
        channel_id: channelId,
        partner_id: partnerId,
    });
    const sessionId = pyEnv["discuss.channel.rtc.session"].create({
        channel_member_id: memberId,
        channel_id: channelId,
    });
    onRpcBefore("/mail/data", (args) => {
        if (args.init_messaging) {
            asyncStep(`/mail/data - ${JSON.stringify(args)}`);
        }
    });
    mockService("mail.sound_effects", {
        play(name) {
            asyncStep(`play - ${name}`);
        },
        stop(name) {
            asyncStep(`stop - ${name}`);
        },
    });
    await start();
    await waitForSteps([
        `/mail/data - ${JSON.stringify({
            init_messaging: {},
            failures: true,
            systray_get_activities: true,
            context: { lang: "en", tz: "taht", uid: serverState.userId, allowed_company_ids: [1] },
        })}`,
    ]);
    const [partner] = pyEnv["res.partner"].read(serverState.partnerId);
    // send after init_messaging because bus subscription is done after init_messaging
    pyEnv["bus.bus"]._sendone(
        partner,
        "mail.record/insert",
        new mailDataHelpers.Store(pyEnv["discuss.channel.rtc.session"].browse(sessionId), {
            channel_member_id: { id: memberId },
        })
            .add(pyEnv["discuss.channel.member"].browse(memberId), {
                persona: { id: partnerId, type: "partner" },
                thread: { id: channelId, model: "discuss.channel" },
            })
            .add(pyEnv["discuss.channel"].browse(channelId), {
                rtcInvitingSession: { id: sessionId },
            })
            .get_result()
    );
    await contains(".o-discuss-CallInvitation");
    await waitForSteps(["play - call-invitation"]);
    // Simulate stop receiving call invitation

    pyEnv["bus.bus"]._sendone(
        partner,
        "mail.record/insert",
        new mailDataHelpers.Store(pyEnv["discuss.channel"].browse(channelId), {
            rtcInvitingSession: false,
        }).get_result()
    );
    await contains(".o-discuss-CallInvitation", { count: 0 });
    await waitForSteps(["stop - call-invitation"]);
});

test("can share screen", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await click("[title='More']");
    await click("[title='Share Screen']");
    await contains("video");
    await triggerEvents(".o-discuss-Call-mainCards", ["mousemove"]); // show overlay
    await click("[title='More']");
    await click("[title='Stop Sharing Screen']");
    await contains("video", { count: 0 });
});

test("can share user camera", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await click("[title='Turn camera on']");
    await contains("video");
    await click("[title='Stop camera']");
    await contains("video", { count: 0 });
});

test("Card should remain in focus after Share Screen is toggled", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await contains(".o-discuss-Call.o-minimized"); // minimized = no card focused
    await click(".o-discuss-CallParticipantCard-avatar");
    await contains(
        ".o-discuss-Call:not(.o-minimized) .o-discuss-CallParticipantCard:not(.o-inset) img" // inset = aside, not inset = center
    );
    await click("[title='Share Screen']");
    await contains(".o-discuss-CallParticipantCard.o-inset img");
    await contains(
        ".o-discuss-Call:not(.o-minimized) .o-discuss-CallParticipantCard:not(.o-inset) video[type='screen']"
    );
    await click("[title='Stop Sharing Screen']");
    await contains(".o-discuss-CallParticipantCard.o-inset", { count: 0 });
    await contains(
        ".o-discuss-Call:not(.o-minimized) .o-discuss-CallParticipantCard:not(.o-inset) img"
    );
});

test("Camera video stream stays in focus when on/off", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await click(".o-discuss-CallParticipantCard-avatar");
    await click("[title='Turn camera on']");
    await click("[title='Stop camera']");
    await click("[title='Turn camera on']");
    await contains("video[type='camera']:not(.o-inset)");
    // test screen sharing then camera on to check camera aside
    await click("[title='Stop camera']");
    await click("[title='Share Screen']");
    await click("[title='Turn camera on']");
    await contains("video[type='screen']:not(.o-inset)");
    await contains("video[type='camera'].o-inset");
});

test("Create a direct message channel when clicking on start a meeting", async () => {
    mockGetMedia();
    await start();
    await openDiscuss();
    await click("button", { text: "Start a meeting" });
    await contains(".o-mail-DiscussSidebarChannel", { text: "Mitchell Admin" });
    await contains(".o-discuss-Call");
    await contains(".o-discuss-ChannelInvitation");
});

test("Can share user camera and screen together", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await click("[title='More']");
    await click("[title='Share Screen']");
    await click("[title='Turn camera on']");
    await contains("video", { count: 2 });
});

test("Click on inset card should replace the inset and active stream together", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await click("[title='More']");
    await click("[title='Share Screen']");
    await click("[title='Turn camera on']");
    await contains("video[type='screen']:not(.o-inset)");
    await click("video[type='camera'].o-inset");
    await contains("video[type='screen'].o-inset");
    await contains("video[type='camera']:not(.o-inset)");
});

test("join/leave sounds are only played on main tab", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    const env1 = await start({ asTab: true });
    const env2 = await start({ asTab: true });
    patchWithCleanup(env1.services["mail.sound_effects"], {
        play(name) {
            asyncStep(`tab1 - play - ${name}`);
        },
    });
    patchWithCleanup(env2.services["mail.sound_effects"], {
        play(name) {
            asyncStep(`tab2 - play - ${name}`);
        },
    });
    await openDiscuss(channelId, { target: env1 });
    await openDiscuss(channelId, { target: env2 });
    await click("[title='Start a Call']", { target: env1 });
    await contains(".o-discuss-Call", { target: env1 });
    await contains(".o-discuss-Call", { target: env2 });
    await waitForSteps(["tab1 - play - call-join"]);
    await click("[title='Disconnect']:not([disabled])", { target: env1 });
    await contains(".o-discuss-Call", { target: env1, count: 0 });
    await contains(".o-discuss-Call", { target: env2, count: 0 });
    await waitForSteps(["tab1 - play - call-leave"]);
});

test("'Start a meeting' in mobile", async () => {
    mockGetMedia();
    patchUiSize({ size: SIZES.SM });
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Partner 2" });
    pyEnv["res.users"].create({ partner_id: partnerId });
    pyEnv["discuss.channel"].create({ name: "Slytherin" });
    await start();
    await openDiscuss();
    await contains("button.active", { text: "Inbox" });
    await click("button", { text: "Chat" });
    await click("button", { text: "Start a meeting" });
    await click(".o-discuss-ChannelInvitation-selectable", { text: "Partner 2" });
    await click("button:not([disabled])", { text: "Invite to Group Chat" });
    await contains(".o-discuss-Call");
    // dropdown requires an extra delay before click (because handler is registered in useEffect)
    await contains("[title='Open Actions Menu']");
    await click("[title='Open Actions Menu']");
    await click(".o-dropdown-item", { text: "Members" });
    await contains(".o-discuss-ChannelMember", { text: "Partner 2" });
});

test("Systray icon shows latest action", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await contains(".o-discuss-CallMenu-buttonContent .fa-microphone");
    await click("[title='Mute']");
    await contains(".o-discuss-CallMenu-buttonContent .fa-microphone-slash");
    await click("[title='Deafen']");
    await contains(".o-discuss-CallMenu-buttonContent .fa-deaf");
    await click("[title='Turn camera on']");
    await contains(".o-discuss-CallMenu-buttonContent .fa-video-camera");
    await click("[title='More']");
    await click("[title='Share Screen']");
    await contains(".o-discuss-CallMenu-buttonContent .fa-desktop");
    await triggerEvents(".o-discuss-Call-mainCards", ["mousemove"]); // show overlay
    await click("[title='More']");
    await click("[title='Raise Hand']");
    await contains(".o-discuss-CallMenu-buttonContent .fa-hand-paper-o");
});

test("Systray icon keeps track of earlier actions", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await contains(".o-discuss-CallMenu-buttonContent .fa-microphone");
    await click("[title='More']");
    await click("[title='Share Screen']");
    // stack: ["share-screen"]
    await contains(".o-discuss-CallMenu-buttonContent .fa-desktop");
    await triggerEvents(".o-discuss-Call-mainCards", ["mousemove"]); // show overlay
    await click("[title='Turn camera on']");
    // stack: ["video", "share-screen"]
    await contains(".o-discuss-CallMenu-buttonContent .fa-video-camera");
    await click("[title='Mute']");
    // stack: ["mute", "video", "share-screen"]
    await contains(".o-discuss-CallMenu-buttonContent .fa-microphone-slash");
    await click("[title='Unmute']");
    // stack: ["video", "share-screen"]
    await contains(".o-discuss-CallMenu-buttonContent .fa-video-camera");
    await click("[title='Stop camera']");
    // stack: ["share-screen"]
    await contains(".o-discuss-CallMenu-buttonContent .fa-desktop");
});

test("show call participants in discuss sidebar", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await contains(".o-mail-DiscussSidebar", {
        contains: [
            ".o-mail-DiscussSidebarChannel:contains('General') ~ .o-mail-DiscussSidebarCallParticipants:contains(Mitchell Admin)",
        ],
    });
});

test("Sort call participants in side bar by name", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    pyEnv["discuss.channel.rtc.session"].create([
        {
            channel_member_id: pyEnv["discuss.channel.member"].create({
                channel_id: channelId,
                partner_id: pyEnv["res.partner"].create({ name: "CCC" }),
            }),
            channel_id: channelId,
        },
        {
            channel_member_id: pyEnv["discuss.channel.member"].create({
                channel_id: channelId,
                partner_id: pyEnv["res.partner"].create({ name: "AAA" }),
            }),
            channel_id: channelId,
        },
        {
            channel_member_id: pyEnv["discuss.channel.member"].create({
                channel_id: channelId,
                partner_id: pyEnv["res.partner"].create({ name: "BBB" }),
            }),
            channel_id: channelId,
        },
    ]);
    await start();
    await openDiscuss(channelId);
    await click("[title='Expand participants']");
    await contains(".o-mail-DiscussSidebarCallParticipants", {
        contains: [
            ".o-mail-DiscussSidebarCallParticipants-participant:nth-child(1):contains('AAA')",
        ],
    });
    await contains(" .o-mail-DiscussSidebarCallParticipants", {
        contains: [
            ".o-mail-DiscussSidebarCallParticipants-participant:nth-child(2):contains('BBB')",
        ],
    });
    await contains(" .o-mail-DiscussSidebarCallParticipants", {
        contains: [
            ".o-mail-DiscussSidebarCallParticipants-participant:nth-child(3):contains('CCC')",
        ],
    });
});

test("expand call participants when joining a call", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const partners = pyEnv["res.partner"].create([
        { name: "Alice" },
        { name: "Bob" },
        { name: "Cathy" },
        { name: "David" },
        { name: "Eric" },
        { name: "Frank" },
    ]);
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    for (const partner of partners) {
        const memberId = pyEnv["discuss.channel.member"].create({
            channel_id: channelId,
            partner_id: partner,
        });
        pyEnv["discuss.channel.rtc.session"].create({
            channel_member_id: memberId,
            channel_id: channelId,
        });
    }
    await start();
    await openDiscuss(channelId);
    await contains(".o-mail-DiscussSidebarCallParticipants img", { count: 4 });
    await contains("img[title='Alice']");
    await contains("img[title='Bob']");
    await contains("img[title='Cathy']");
    await contains("img[title='David']");
    await contains(".o-mail-DiscussSidebarCallParticipants span", { text: "+2" });
    await click("[title='Join Call']");
    await contains(".o-mail-DiscussSidebarCallParticipants img", { count: 7 });
    await contains("img[title='Alice']");
    await contains("img[title='Bob']");
    await contains("img[title='Cathy']");
    await contains("img[title='David']");
    await contains("img[title='Eric']");
    await contains("img[title='Frank']");
    await contains("img[title='Mitchell Admin']");
});

test("start call when accepting from push notification", async () => {
    patchWithCleanup(window.navigator, {
        serviceWorker: Object.assign(new EventBus(), { register: () => Promise.resolve() }),
    });
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss();
    await contains(".o-mail-Discuss-threadName[title=Inbox]");
    browser.navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", {
            data: { action: "OPEN_CHANNEL", data: { id: channelId, joinCall: true } },
        })
    );
    await contains(".o-mail-Discuss-threadName[title=General]");
    await contains(`.o-discuss-CallParticipantCard[title='${serverState.partnerName}']`);
});

test("Use saved volume settings", async () => {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    const partnerName = "Another Participant";
    const partnerId = pyEnv["res.partner"].create({ name: partnerName });
    pyEnv["discuss.channel.rtc.session"].create({
        channel_member_id: pyEnv["discuss.channel.member"].create({
            channel_id: channelId,
            partner_id: partnerId,
        }),
        channel_id: channelId,
    });
    const expectedVolume = 0.31;
    pyEnv["res.users.settings.volumes"].create({
        user_setting_id: pyEnv["res.users.settings"].create({
            user_id: serverState.userId,
        }),
        partner_id: partnerId,
        volume: expectedVolume,
    });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start a Call']");
    await contains(".o-discuss-Call");
    await triggerEvents(`.o-discuss-CallParticipantCard[title='${partnerName}']`, ["contextmenu"]);
    await contains(".o-discuss-CallContextMenu");
    const rangeInput = queryFirst(".o-discuss-CallContextMenu input[type='range']");
    expect(rangeInput.value).toBe(expectedVolume.toString());
    await click(".o-discuss-CallActionList button[aria-label='Disconnect']");
});
