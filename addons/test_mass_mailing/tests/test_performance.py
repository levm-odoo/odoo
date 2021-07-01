# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.mail.tests.common import mail_new_test_user
from odoo.tests.common import TransactionCase, users, warmup
from odoo.tests import tagged
from odoo.tools import mute_logger


class TestMassMailPerformanceBase(TransactionCase):

    def setUp(self):
        super(TestMassMailPerformanceBase, self).setUp()

        self.user_employee = mail_new_test_user(
            self.env, login='emp',
            groups='base.group_user',
            name='Ernest Employee', notification_type='inbox')

        self.user_marketing = mail_new_test_user(
            self.env, login='marketing',
            groups='base.group_user,mass_mailing.group_mass_mailing_user',
            name='Martial Marketing', signature='--\nMartial')

        # patch registry to simulate a ready environment
        self.patch(self.env.registry, 'ready', True)


@tagged('mail_performance')
class TestMassMailPerformance(TestMassMailPerformanceBase):

    def setUp(self):
        super(TestMassMailPerformance, self).setUp()
        values = [{
            'name': 'Recipient %s' % x,
            'email_from': 'Recipient <rec.%s@example.com>' % x,
        } for x in range(0, 50)]
        self.mm_recs = self.env['mailing.performance'].create(values)

    @users('__system__', 'marketing')
    @warmup
    @mute_logger('odoo.addons.mail.models.mail_mail', 'odoo.models.unlink', 'odoo.tests')
    def test_send_mailing(self):
        mailing = self.env['mailing.mailing'].create({
            'name': 'Test',
            'subject': 'Test',
            'body_html': '<p>Hello <a role="button" href="https://www.example.com/foo/bar?baz=qux">quux</a><a role="button" href="/unsubscribe_from_list">Unsubscribe</a></p>',
            'reply_to_mode': 'new',
            'mailing_model_id': self.ref('test_mass_mailing.model_mailing_performance'),
            'mailing_domain': [('id', 'in', self.mm_recs.ids)],
        })

        # runbot needs +50 compared to local
        with self.assertQueryCount(__system__=488, marketing=488):
            mailing.action_send_mail()

        self.assertEqual(mailing.sent, 50)
        self.assertEqual(mailing.delivered, 50)

        mails = self.env['mail.mail'].sudo().search([('mailing_id', '=', mailing.id)])
        self.assertFalse(mails)


@tagged('mail_performance')
class TestMassMailBlPerformance(TestMassMailPerformanceBase):

    def setUp(self):
        """ In this setup we prepare 20 blacklist entries. We therefore add
        20 recipients compared to first test in order to have comparable results. """
        super(TestMassMailBlPerformance, self).setUp()
        values = [{
            'name': 'Recipient %s' % x,
            'email_from': 'Recipient <rec.%s@example.com>' % x,
        } for x in range(0, 62)]
        self.mm_recs = self.env['mailing.performance.blacklist'].create(values)

        for x in range(1, 13):
            self.env['mail.blacklist'].create({
                'email': 'rec.%s@example.com' % (x * 5)
            })
        self.env['mailing.performance.blacklist'].flush()

    @users('__system__', 'marketing')
    @warmup
    @mute_logger('odoo.addons.mail.models.mail_mail', 'odoo.models.unlink', 'odoo.tests')
    def test_send_mailing_w_bl(self):
        mailing = self.env['mailing.mailing'].create({
            'name': 'Test',
            'subject': 'Test',
            'body_html': '<p>Hello <a role="button" href="https://www.example.com/foo/bar?baz=qux">quux</a><a role="button" href="/unsubscribe_from_list">Unsubscribe</a></p>',
            'reply_to_mode': 'new',
            'mailing_model_id': self.ref('test_mass_mailing.model_mailing_performance_blacklist'),
            'mailing_domain': [('id', 'in', self.mm_recs.ids)],
        })

        # runbot needs +62 compared to local
        with self.assertQueryCount(__system__=562, marketing=562):
            mailing.action_send_mail()

        self.assertEqual(mailing.sent, 50)
        self.assertEqual(mailing.delivered, 50)

        mails = self.env['mail.mail'].sudo().search([('mailing_id', '=', mailing.id)])
        self.assertFalse(mails)
