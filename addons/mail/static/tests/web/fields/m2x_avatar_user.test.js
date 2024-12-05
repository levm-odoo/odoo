import { test } from "@odoo/hoot";
import { mountView, makeMockServer, onRpc } from "@web/../tests/web_test_helpers";
import {
    contains,
    defineMailModels,
    click,
    triggerHotkey,
    start,
    startServer,
} from "../../mail_test_helpers";
import { EventBus } from "@odoo/owl";
import { animationFrame } from "@odoo/hoot-dom";
import { getOrigin } from "@web/core/utils/urls";
import { registry } from "@web/core/registry";

const fakeMultiTab = {
    start() {
        const bus = new EventBus();
        return {
            bus,
            get currentTabId() {
                return null;
            },
            isOnMainTab() {
                return true;
            },
            getSharedValue(key, defaultValue) {
                return "";
            },
            setSharedValue(key, value) {},
            removeSharedValue(key) {},
        };
    },
};

const fakeImStatusService = {
    start() {
        return {
            registerToImStatus() {},
            unregisterFromImStatus() {},
        };
    },
};

defineMailModels();

test("many2many_avatar_user in kanban view", async () => {
    const { env: pyEnv } = await makeMockServer();
    const [p1, p2, p3, p4] = pyEnv["res.partner"].create([
        { name: "Mario" },
        { name: "Yoshi" },
        { name: "Luigi" },
        { name: "Tapu" },
    ]);
    const userIds = pyEnv["res.users"].create([
        { partner_id: p1 },
        { partner_id: p2 },
        { partner_id: p3 },
        { partner_id: p4 },
    ]);
    pyEnv["m2x.avatar.user"].create({ user_ids: userIds });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "kanban",
        arch: `<kanban>
                <templates>
                    <t t-name="card">
                        <field name="user_id"/>
                        <field name="user_ids" widget="many2many_avatar_user"/>
                    </t>
                </templates>
            </kanban>`,
    });
    await click(".o_kanban_record .o_field_many2many_avatar_user .o_m2m_avatar_empty", {
        text: "+2",
    });
    await click(".o_kanban_record .o_field_many2many_avatar_user .o_m2m_avatar_empty");
    await contains(".o_popover > .o_field_tags > .o_tag", { count: 4 });
    await animationFrame();
    await contains(".o_popover > .o_field_tags > :nth-child(1 of .o_tag)", { text: "Tapu" });
    await contains(".o_popover > .o_field_tags > :nth-child(2 of .o_tag)", { text: "Luigi" });
    await contains(".o_popover > .o_field_tags > :nth-child(3 of .o_tag)", { text: "Yoshi" });
    await contains(".o_popover > .o_field_tags > :nth-child(4 of .o_tag)", { text: "Mario" });
});

test("many2one_avatar_user widget edited by the smart action 'Assign to...'", async () => {
    const { env: pyEnv } = await makeMockServer();
    const [p1, p2, p3] = pyEnv["res.partner"].create([
        { name: "Mario" },
        { name: "Luigi" },
        { name: "Yoshi" },
    ]);
    const [userIds] = pyEnv["res.users"].create([
        { partner_id: p1 },
        { partner_id: p2 },
        { partner_id: p3 },
    ]);
    const avatarUserId_1 = pyEnv["m2x.avatar.user"].create({ user_id: userIds });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "form",
        arch: `<form><field name="user_id" widget="many2one_avatar_user"/></form>`,
        resId: avatarUserId_1,
    });
    await contains(".o_field_many2one_avatar_user input", { value: "Mario" });
    triggerHotkey("control+k");
    await click(".o_command", { text: "Assign to ...ALT + I" });
    await contains(".o_command", { count: 6 });
    // The order in which the users are fetched based on the increasing of the 'partner_id' that is why the oreder is changed in the testcase
    await contains(":nth-child(1 of .o_command)", { text: "Mitchell Admin" });
    await contains(":nth-child(2 of .o_command)", { text: "Public user" });
    await contains(":nth-child(3 of .o_command)", { text: "OdooBot" });
    await contains(":nth-child(4 of .o_command)", { text: "Mario" });
    await contains(":nth-child(5 of .o_command)", { text: "Luigi" });
    await contains(":nth-child(6 of .o_command)", { text: "Yoshi" });
    await click(".o_command", { text: "Luigi" });
    await contains(".o_field_many2one_avatar_user input", { value: "Luigi" });
});

test("many2one_avatar_user widget edited by the smart action 'Assign to me'", async () => {
    const { env: pyEnv } = await makeMockServer();
    const p1 = pyEnv["res.partner"].create({ name: "Mario" });
    const userIds = pyEnv["res.users"].create({ partner_id: p1 });
    const avatarUserId_1 = pyEnv["m2x.avatar.user"].create({ user_id: userIds });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "form",
        arch: `<form><field name="user_id" widget="many2one_avatar_user"/></form>`,
        resId: avatarUserId_1,
    });
    await contains(".o_field_many2one_avatar_user input", { value: "Mario" });
    triggerHotkey("control+k");
    await contains(".o_command", { text: "Assign to meALT + SHIFT + I" });
    // Assign me
    triggerHotkey("alt+shift+i");
    await contains(".o_field_many2one_avatar_user input", {
        value: "Mitchell Admin", // should be "Mitchell Admin" but session is not sync with currentUser
    });
    // Unassign me
    triggerHotkey("control+k");
    await click(".o_command", { text: "Unassign from meALT + SHIFT + I" });
    await contains(".o_field_many2one_avatar_user input", { value: "" });
});

test("many2many_avatar_user widget edited by the smart action 'Assign to...'", async () => {
    const { env: pyEnv } = await makeMockServer();
    const [p1, p2, p3] = pyEnv["res.partner"].create([
        { name: "Mario" },
        { name: "Yoshi" },
        { name: "Luigi" },
    ]);
    const [userId_1, userId_2] = pyEnv["res.users"].create([
        { partner_id: p1 },
        { partner_id: p2 },
        { partner_id: p3 },
    ]);
    const avatarUserId_1 = pyEnv["m2x.avatar.user"].create({ user_ids: [userId_1, userId_2] });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "form",
        arch: `<form><field name="user_ids" widget="many2many_avatar_user"/></form>`,
        resId: avatarUserId_1,
    });
    await animationFrame();
    await contains(".o_tag_badge_text", { count: 2 });
    await contains(":nth-child(1 of .o_tag) .o_tag_badge_text", { text: "Mario" });
    await contains(":nth-child(2 of .o_tag) .o_tag_badge_text", { text: "Yoshi" });
    triggerHotkey("control+k");
    await contains(".o_command", { text: "Assign to ...ALT + I" });
    triggerHotkey("alt+i");
    await contains(".o_command", { count: 4 });
    await contains(":nth-child(1 of .o_command)", { text: "Mitchell Admin" });
    await contains(":nth-child(2 of.o_command)", { text: "Public user" });
    await contains(":nth-child(3 of .o_command)", { text: "OdooBot" });
    await contains(":nth-child(4 of.o_command)", { text: "Luigi" });
    await click(".o_command", { text: "Luigi" });
    await contains(".o_tag_badge_text", { count: 3 });
    await contains(":nth-child(1 of .o_tag) .o_tag_badge_text", { text: "Mario" });
    await contains(":nth-child(2 of .o_tag) .o_tag_badge_text", { text: "Yoshi" });
    await contains(":nth-child(3 of .o_tag) .o_tag_badge_text", { text: "Luigi" });
});

// test("many2one_avatar_user widget edited by the smart action 'Assign to me' in form view", async () => {
//     const { env: pyEnv } = await makeMockServer();
//     const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
//         { name: "Mario" },
//         { name: "Luigi" },
//     ]);
//     const [userId_1, userId_2] = pyEnv["res.users"].create([
//         { name: "Mario", partner_id: partnerId_1 },
//         { name: "Luigi", partner_id: partnerId_2, login: "test", password: "test" },
//     ]);
//     const avatarUserId_1 = pyEnv["m2x.avatar.user"].create({ user_id: userId_1 });
//     const [partnerUser] = pyEnv["res.users"].search_read([["id", "=", userId_2]]);
//     serverState.userId = partnerUser.id;
//     console.log(serverState.userId);

//     await mountView({
//         resModel: "m2x.avatar.user",
//         type: "form",
//         arch: `<form><field name="user_id" widget="many2one_avatar_user"/></form>`,
//         resId: avatarUserId_1,
//     });
//     await contains(".o_field_man y2one_avatar_user input", { value: "Mario" });
//     await triggerHotkey("control+k");
//     await contains(".o_command", { text: "Assign to meALT + SHIFT + I" });

//     // Assign me (Luigi)
//     await triggerHotkey("alt+shift+i");
//     debugger;
//     await animationFrame();
//     console.log(serverState.userId);
//     debugger;

//     // await openFormView("m2x.avatar.user", avatarUserId_1, {
//     // arch: `<form><field name="user_id" widget="many2one_avatar_user"/></form>`,
//     // });

//     await contains(".o_field_many2one_avatar_user input", { value: "Luigi" });

//     // Unassign me
//     await triggerHotkey("control+k");
//     await click(".o_command", { text: "Unassign from meALT + SHIFT + I" });
//     await contains(".o_field_many2one_avatar_user input", { value: "" });
//     // });
// });

test("many2many_avatar_user widget edited by the smart action 'Assign to me'", async () => {
    const { env: pyEnv } = await makeMockServer();
    const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
        { name: "Mario" },
        { name: "Yoshi" },
    ]);
    const [userId_1, userId_2] = pyEnv["res.users"].create([
        { name: "Mario", partner_id: partnerId_1 },
        { name: "Yoshi", partner_id: partnerId_2 },
    ]);
    const m2xAvatarUserId1 = pyEnv["m2x.avatar.user"].create({
        user_ids: [userId_1, userId_2],
    });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "form",
        arch: `<form><field name="user_ids" widget="many2many_avatar_user"/></form>`,
        resId: m2xAvatarUserId1,
    });
    await contains(".o_tag_badge_text", { count: 2 });
    await contains(":nth-child(1 of .o_tag) .o_tag_badge_text", { text: "Mario" });
    await contains(":nth-child(2 of .o_tag) .o_tag_badge_text", { text: "Yoshi" });
    triggerHotkey("control+k");
    await contains(".o_command", { text: "Assign to meALT + SHIFT + I" });
    // Assign me
    triggerHotkey("alt+shift+i");
    await contains(".o_tag_badge_text", { count: 3 });
    await contains(":nth-child(1 of .o_tag) .o_tag_badge_text", { text: "Mario" });
    await contains(":nth-child(2 of .o_tag) .o_tag_badge_text", { text: "Yoshi" });
    await contains(":nth-child(3 of .o_tag) .o_tag_badge_text", { text: "Mitchell Admin" });
    // Unassign me
    triggerHotkey("control+k");
    await contains(".o_command", { text: "Unassign from meALT + SHIFT + I" });
    triggerHotkey("alt+shift+i");
    await contains(".o_tag_badge_text", { count: 2 });
    await contains(":nth-child(1 of .o_tag) .o_tag_badge_text", { text: "Mario" });
    await contains(":nth-child(2 of .o_tag) .o_tag_badge_text", { text: "Yoshi" });
});

test("avatar_user widget displays the appropriate user image in list view", async () => {
    const { env: pyEnv } = await makeMockServer();
    const partnerId_1 = pyEnv["res.partner"].create({ name: "Mario" });
    const userId = pyEnv["res.users"].create({ name: "Mario", partner_id: partnerId_1 });
    const avatarUserId = pyEnv["m2x.avatar.user"].create({ user_id: userId });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "list",
        arch: `<list><field name="user_id" widget="many2one_avatar_user"/></list>`,
        resId: avatarUserId,
    });
    await contains(`.o_m2o_avatar > img[data-src="/web/image/res.users/${userId}/avatar_128"]`);
});

test("avatar_user widget displays the appropriate user image in kanban view", async () => {
    const { env: pyEnv } = await makeMockServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Mario" });
    const userId = pyEnv["res.users"].create({ name: "Mario", partner_id: partnerId });
    const avatarUserId = pyEnv["m2x.avatar.user"].create({ user_id: userId });
    await start();
    await mountView({
        resModel: "m2x.avatar.user",
        type: "kanban",
        arch: `<kanban>
                    <templates>
                        <t t-name="card">
                            <field name="user_id" widget="many2one_avatar_user"/>
                        </t>
                    </templates>
                </kanban>`,
        resId: avatarUserId,
    });
    await contains(`.o_m2o_avatar > img[data-src="/web/image/res.users/${userId}/avatar_128"]`);
});

test("avatar card preview", async () => {
    registry.category("services").add("multi_tab", fakeMultiTab, { force: true });
    registry.category("services").add("im_status", fakeImStatusService, { force: true });
    const { env: pyEnv } = await makeMockServer();
    pyEnv["res.users"].create({
        name: "Mario",
        email: "Mario@odoo.test",
        phone: "+78786987",
        im_status: "online",
    });
    onRpc((request) => {
        if (request.route === "/web/dataset/call_kw/res.users/read") {
            // assert.deepEqual(args.args[1], [
            //     "name",
            //     "email",
            //     "phone",
            //     "im_status",
            //     "share",
            //     "partner_id",
            // ]);
            // step("user read");
            console.log(request);
        }
    });
    // const avatarUserId = pyEnv["m2x.avatar.user"].create({ user_id: userId });

    // Open card
    await click(".o_m2o_avatar > img");
    await contains(".o_avatar_card");
    await contains(".o_card_user_infos > span", { text: "Mario" });
    await contains(".o_card_user_infos > a", { text: "Mario@odoo.test" });
    await contains(".o_card_user_infos > a", { text: "+78786987" });
    // Close card
    await click(".o_action_manager");
    await contains(".o_avatar_card", { count: 0 });
});

test("avatar_user widget displays the appropriate user image in form view", async () => {
    const { env: pyEnv } = await makeMockServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Mario" });
    const userId = pyEnv["res.users"].create({ name: "Mario", partner_id: partnerId });
    const avatarUserId = pyEnv["m2x.avatar.user"].create({ user_ids: [userId] });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "form",
        arch: `<form><field name="user_ids" widget="many2many_avatar_user"/></form>`,
        resId: avatarUserId,
    });
    await contains(
        `.o_field_many2many_avatar_user.o_field_widget .o_avatar img[data-src="${getOrigin()}/web/image/res.users/${userId}/avatar_128"]`
    );
});

test("many2one_avatar_user widget in list view", async () => {
    const { env: pyEnv } = await makeMockServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Mario" });
    const userId = pyEnv["res.users"].create({
        name: "Mario",
        partner_id: partnerId,
        email: "Mario@partner.com",
        phone: "+45687468",
    });
    pyEnv["m2x.avatar.user"].create({ user_id: userId });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "list",
        arch: `<list><field name="user_id" widget="many2one_avatar_user"/></list>`,
    });
    await click(".o_data_cell .o_m2o_avatar > img");
    await contains(".o_avatar_card");
    await contains(".o_card_user_infos > span", { text: "Mario" });
    await contains(".o_card_user_infos > a", { text: "Mario@partner.com" });
    await contains(".o_card_user_infos > a", { text: "+45687468" });
});

test("many2many_avatar_user widget in form view", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Partner 1" });
    const userId = pyEnv["res.users"].create({
        name: "Mario",
        partner_id: partnerId,
        email: "Mario@partner.com",
        phone: "+45687468",
    });
    pyEnv["res.partner"].create({
        name: "Harry",
        im_status: "offline",
        user_ids: [pyEnv["res.users"].create({ name: "Harry" })],
    });
    const avatarUserId = pyEnv["m2x.avatar.user"].create({ user_ids: [userId] });
    await mountView({
        resModel: "m2x.avatar.user",
        type: "form",
        arch: `<form>
                <field name="user_ids" widget="many2many_avatar_user"/>
            </form>`,
        resId: avatarUserId,
    });
    await click(".o_field_many2many_avatar_user .o_avatar img");
    await contains(".o_avatar_card");
    await contains(".o_card_user_infos > span", { text: "Mario" });
    await contains(".o_card_user_infos > a", { text: "Mario@partner.com" });
    await contains(".o_card_user_infos > a", { text: "+45687468" });
});
