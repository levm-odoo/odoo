# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from .eu_tax_map import EU_TAX_MAP


class Company(models.Model):
    _inherit = 'res.company'

    @api.model
    def _map_all_eu_companies_taxes(self):
        ''' Identifies EU companies and calls the _map_eu_taxes function
        '''
        eu_countries = self.env.ref('base.europe').country_ids
<<<<<<< HEAD
        companies = self.search([('account_tax_fiscal_country_id','in', eu_countries.ids)])
        companies._map_eu_taxes()

    def _map_eu_taxes(self):
        '''Creates or updates Fiscal Positions for each EU country excluding the company's account_tax_fiscal_country_id
=======
        companies = self.search([('country_id','in', eu_countries.ids)])
        companies._map_eu_taxes()

    def _map_eu_taxes(self):
        '''Creates or updates Fiscal Positions for each EU country excluding the company's country_id
>>>>>>> 64abde8dc6f... temp
        '''
        eu_countries = self.env.ref('base.europe').country_ids
        oss_tax_groups = self.env['ir.model.data'].search([
            ('module', '=', 'l10n_eu_service'),
            ('model', '=', 'account.tax.group')])
        for company in self:
            invoice_repartition_lines, refund_repartition_lines = company._get_repartition_lines_oss()
            taxes = self.env['account.tax'].search([
                ('type_tax_use', '=', 'sale'),
                ('amount_type', '=', 'percent'),
                ('company_id','=', company.id),
                ('tax_group_id', 'not in', oss_tax_groups.mapped('res_id'))])
<<<<<<< HEAD
            for country in eu_countries - company.account_tax_fiscal_country_id:
                mapping = []
                foreign_taxes = {}
=======
            for country in eu_countries - company.country_id:
                mapping = []

>>>>>>> 64abde8dc6f... temp
                fpos = self.env['account.fiscal.position'].search([
                            ('country_id', '=', country.id),
                            ('company_id', '=', company.id),
                            ('auto_apply', '=', True),
                            ('vat_required', '=', False)], limit=1)
                if not fpos:
                    fpos = self.env['account.fiscal.position'].create({
                        'name': 'OSS B2C %s' % country.name,
                        'country_id': country.id,
                        'company_id': company.id,
                        'auto_apply': True,
                    })
<<<<<<< HEAD
                for domestic_tax in taxes:
                    tax_amount = EU_TAX_MAP.get((company.account_tax_fiscal_country_id.code, domestic_tax.amount, country.code), False)
=======

                foreign_taxes = {tax.amount: tax for tax in fpos.tax_ids.tax_dest_id if tax.amount_type == 'percent'}

                for domestic_tax in taxes:
                    tax_amount = EU_TAX_MAP.get((company.country_id.code, domestic_tax.amount, country.code), False)
>>>>>>> 64abde8dc6f... temp
                    if tax_amount and domestic_tax not in fpos.tax_ids.tax_src_id:
                        if not foreign_taxes.get(tax_amount, False):
                            if not self.env['ir.model.data'].xmlid_to_object('l10n_eu_service.oss_tax_group_%s' % str(tax_amount).replace('.','_')):
                                self.env['ir.model.data'].create({
                                    'name': 'oss_tax_group_%s' % str(tax_amount).replace('.','_'),
                                    'module': 'l10n_eu_service',
                                    'model': 'account.tax.group',
                                    'res_id': self.env['account.tax.group'].create({'name': 'OSS %s%%' % tax_amount}).id,
                                    'noupdate': True,
                                    })
                            foreign_taxes[tax_amount] = self.env['account.tax'].create({
                                'name': '%(rate)s%% %(country)s %(label)s' % {'rate': tax_amount, 'country': country.code, 'label': country.vat_label},
                                'amount': tax_amount,
                                'invoice_repartition_line_ids': invoice_repartition_lines,
                                'refund_repartition_line_ids': refund_repartition_lines,
                                'type_tax_use': 'sale',
                                'description': "%s%%" % tax_amount,
                                'tax_group_id': self.env.ref('l10n_eu_service.oss_tax_group_%s' % str(tax_amount).replace('.','_')).id,
                                'sequence': 1000,
                                'company_id': company.id,
                            })
                        mapping.append((0, 0, {'tax_src_id': domestic_tax.id, 'tax_dest_id': foreign_taxes[tax_amount].id}))
                if mapping:
                    fpos.write({
                        'tax_ids': mapping
                    })

    def _get_repartition_lines_oss(self):
        self.ensure_one()
<<<<<<< HEAD
        defaults = self.env['account.tax'].with_company(self).default_get(['invoice_repartition_line_ids', 'refund_repartition_line_ids'])
=======
        defaults = self.env['account.tax'].with_context(allowed_company_ids=self.ids).default_get(['invoice_repartition_line_ids', 'refund_repartition_line_ids'])
>>>>>>> 64abde8dc6f... temp
        oss_account = self._get_oss_account()
        if oss_account:
            defaults['invoice_repartition_line_ids'][1][2]['account_id'] = oss_account.id
            defaults['refund_repartition_line_ids'][1][2]['account_id'] = oss_account.id
        return defaults['invoice_repartition_line_ids'], defaults['refund_repartition_line_ids']

    def _get_oss_account(self):
        self.ensure_one()
        if not self.env['ir.model.data'].xmlid_to_object('l10n_eu_service.oss_tax_account_company_%s' % self.id):
            sales_tax_accounts = self.env['account.tax'].search([
                    ('type_tax_use', '=', 'sale'),
                    ('company_id', '=', self.id)
                ]).invoice_repartition_line_ids.mapped('account_id')
            if not sales_tax_accounts:
                return False
            new_code = self.env['account.account']._search_new_account_code(self, len(sales_tax_accounts[0].code), sales_tax_accounts[0].code[:-2])
            oss_account = self.env['account.account'].create({
                'name': '%s OSS' % sales_tax_accounts[0].name,
                'code': new_code,
                'user_type_id': sales_tax_accounts[0].user_type_id.id,
                'company_id': self.id,
                })
            self.env['ir.model.data'].create({
                'name': 'oss_tax_account_company_%s' % self.id,
                'module': 'l10n_eu_service',
                'model': 'account.account',
                'res_id': oss_account.id,
                'noupdate': True,
                })
        return self.env.ref('l10n_eu_service.oss_tax_account_company_%s' % self.id)
