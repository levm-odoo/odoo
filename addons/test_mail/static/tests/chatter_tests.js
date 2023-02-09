/** @odoo-module **/

import {
    start,
    startServer,
} from '@mail/../tests/helpers/test_utils';


QUnit.module('mail', {}, function () {
QUnit.module('Chatter');

QUnit.test('Send message button activation (access rights dependent)', async function (assert) {
    const pyEnv = await startServer();
    const view = `<form string="Simple">
                      <sheet>
                          <field name="name"/>
                      </sheet>
                      <div class="oe_chatter">
                          <field name="message_ids"/>
                      </div>
                  </form>`;

    let userAccess = {};
    const { openView } = await start({
        serverData: {
            views: {
                'mail.test.simple,false,form': view,
                'mail.test.simple.mc,false,form': view,
            }
        },
        async mockRPC(route, args, performRPC) {
            const res = await performRPC(route, args);
            if (route === '/mail/thread/data') {
                // mimic user with custom access defined in userAccess variable
                const { thread_model } = args;
                Object.assign(res, userAccess);
                res['canPostOnReadonly'] = thread_model === 'mail.test.simple.mc';
            }
            return res;
        },
    });
    const resSimpleId1 = pyEnv['mail.test.simple'].create({ name: 'Test simple' });
    const resSimpleMCId1 = pyEnv['mail.test.simple.mc'].create({ name: 'Test simple MC' });
    async function assertSendButton(enabled, msg,
                                    model = null, resId = null,
                                    hasReadAccess = false, hasWriteAccess = false) {
        userAccess = { hasReadAccess, hasWriteAccess };
        await openView({
            res_id: resId,
            res_model: model,
            views: [[false, 'form']],
        });
        const details = `hasReadAccess: ${hasReadAccess}, hasWriteAccess: ${hasWriteAccess}, model: ${model}, resId: ${resId}`;
        if (enabled) {
            assert.containsNone(document.body, '.o_ChatterTopbar_buttonSendMessage:disabled',
                `${msg}: send message button must not be disabled (${details}`);
        } else {
            assert.containsOnce(document.body, '.o_ChatterTopbar_buttonSendMessage:disabled',
                `${msg}: send message button must be disabled (${details})`);
        }
    }
    const enabled = true, disabled = false;

    await assertSendButton(enabled, 'Record, all rights', 'mail.test.simple', resSimpleId1, true, true);
    await assertSendButton(enabled, 'Record, all rights', 'mail.test.simple.mc', resSimpleId1, true, true);
    await assertSendButton(disabled, 'Record, no write access', 'mail.test.simple', resSimpleId1, true);
    await assertSendButton(enabled, 'Record, read access but model accept post with read only access',
        'mail.test.simple.mc', resSimpleMCId1, true);
    await assertSendButton(disabled, 'Record, no rights', 'mail.test.simple', resSimpleId1);
    await assertSendButton(disabled, 'Record, no rights', 'mail.test.simple.mc', resSimpleMCId1);

    // Note that rights have no impact on send button for draft record (chatter.isTemporary=true)
    await assertSendButton(enabled, 'Draft record', 'mail.test.simple');
    await assertSendButton(enabled, 'Draft record', 'mail.test.simple.mc');
});

});
