# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests.common import TransactionCase


class TestCompany(TransactionCase):

    def test_check_active(self):
        """Tests the ability to archive a company whether or not it still has active users.
        Tests an archived user in an archived company cannot be unarchived
        without changing its company to an active company."""
        company = self.env['res.company'].create({'name': 'foo'})
        user = self.env['res.users'].create({
            'name': 'foo',
            'login': 'foo',
            'company_id': company.id,
            'company_ids': company.ids,
        })

        # The company cannot be archived because it still has active users
        with self.assertRaisesRegex(ValidationError, 'The company foo cannot be archived'):
            company.action_archive()

        # The company can be archived because it has no active users
        user.action_archive()
        company.action_archive()

        # The user cannot be unarchived because it's default company is archived
        with self.assertRaisesRegex(ValidationError, 'Company foo is not in the allowed companies'):
            user.action_unarchive()

        # The user can be unarchived once we set another, active, company
        main_company = self.env.ref('base.main_company')
        user.write({
            'company_id': main_company.id,
            'company_ids': main_company.ids,
        })
        user.action_unarchive()

    def test_logo_check(self):
        """Ensure uses_default_logo is properly (re-)computed."""
        company = self.env['res.company'].create({'name': 'foo'})

        self.assertTrue(company.logo, 'Should have a default logo')
        self.assertTrue(company.uses_default_logo)
        company.partner_id.image_1920 = False
        # No logo means we fall back to another default logo for the website route -> uses_default
        self.assertTrue(company.uses_default_logo)
        company.partner_id.image_1920 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        self.assertFalse(company.uses_default_logo)

    def test_unlink_company_with_children(self):
        """Ensure that companies with child companies cannot be deleted."""

        parent_company = self.env['res.company'].create({
            'name': 'Parent Company',
            'child_ids': [
                Command.create({'name': 'Child Company'}),
            ],
        })

        with self.assertRaises(UserError):
            parent_company.unlink()
        self.assertTrue(parent_company.exists())

    def test_create_branch_with_default_parent_id(self):
        branch = self.env['res.company'].with_context(default_parent_id=self.env.company.id).create({'name': 'Branch Company'})
        self.assertFalse(branch.partner_id.parent_id)

    def test_access_parent_companies(self):
        """Ensure a user can read the parents of the company it has access to even if
        it doesn't have access to the parent company."""
        branch = self.env['res.company'].create({
            'name': 'Branch Company',
            'parent_id': self.env.company.id,
        })
        user = self.env['res.users'].create({
            'name': 'foo',
            'login': 'foo',
            'company_id': branch.id,
            'company_ids': branch.ids,
        })
        self.assertEqual(branch.with_user(user).parent_ids, self.env.company + branch)
        with self.assertRaises(AccessError, msg="The fields of the related records should not be exposed"):
            self.env.company.with_user(user).name
