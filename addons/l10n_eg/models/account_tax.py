from odoo import models, fields


class ETAAccountTaxMixin(models.AbstractModel):
    _name = 'l10n_eg.eta.account.tax.mixin'
    _description = 'ETA tax codes mixin'

    l10n_eg_eta_code = fields.Selection(
        selection=[
            ('t1_v001', 'T1 - V001 - Export'),
            ('t1_v002', 'T1 - V002 - Export to free areas and other areas'),
            ('t1_v003', 'T1 - V003 - Exempted good or service'),
            ('t1_v004', 'T1 - V004 - A non-taxable good or service'),
            ('t1_v005', 'T1 - V005 - Exemptions for diplomats, consulates and embassies'),
            ('t1_v006', 'T1 - V006 - Defence and National security Exemptions'),
            ('t1_v007', 'T1 - V007 - Agreements exemptions'),
            ('t1_v008', 'T1 - V008 - Special Exemption and other reasons'),
            ('t1_v009', 'T1 - V009 - General Item sales'),
            ('t1_v010', 'T1 - V010 - Other Rates'),
            ('t2_tbl01', 'T2 - Tbl01 - Table tax (percentage)'),
            ('t3_tbl02', 'T3 - Tbl02 - Table tax (Fixed Amount)'),
            ('t4_w001', 'T4 - W001 - Contracting'),
            ('t4_w002', 'T4 - W002 - Supplies'),
            ('t4_w003', 'T4 - W003 - Purchases'),
            ('t4_w004', 'T4 - W004 - Services'),
            ('t4_w005', 'T4 - W005 - Sums paid by the cooperative societies for car transportation to their members'),
            ('t4_w006', 'T4 - W006 - Commission agency & brokerage'),
            ('t4_w007', 'T4 - W007 - Discounts & grants & additional exceptional incentives (smoke, cement companies)'),
            ('t4_w008', 'T4 - W008 - All discounts & grants & commissions (petroleum, telecommunications, and other)'),
            ('t4_w009', 'T4 - W009 - Supporting export subsidies'),
            ('t4_w010', 'T4 - W010 - Professional fees'),
            ('t4_w011', 'T4 - W011 - Commission & brokerage _A_57'),
            ('t4_w012', 'T4 - W012 - Hospitals collecting from doctors'),
            ('t4_w013', 'T4 - W013 - Royalties'),
            ('t4_w014', 'T4 - W014 - Customs clearance'),
            ('t4_w015', 'T4 - W015 - Exemption'),
            ('t4_w016', 'T4 - W016 - advance payments'),
            ('t5_st01', 'T5 - ST01 - Stamping tax (percentage)'),
            ('t6_st02', 'T6 - ST02 - Stamping Tax (amount)'),
            ('t7_ent01', 'T7 - Ent01 - Entertainment tax (rate)'),
            ('t7_ent02', 'T7 - Ent02 - Entertainment tax (amount)'),
            ('t8_rd01', 'T8 - RD01 - Resource development fee (rate)'),
            ('t8_rd02', 'T8 - RD02 - Resource development fee (amount)'),
            ('t9_sc01', 'T9 - SC01 - Service charges (rate)'),
            ('t9_sc02', 'T9 - SC02 - Service charges (amount)'),
            ('t10_mn01', 'T10 - Mn01 - Municipality Fees (rate)'),
            ('t10_mn02', 'T10 - Mn02 - Municipality Fees (amount)'),
            ('t11_mi01', 'T11 - MI01 - Medical insurance fee (rate)'),
            ('t11_mi02', 'T11 - MI02 - Medical insurance fee (amount)'),
            ('t12_of01', 'T12 - OF01 - Other fees (rate)'),
            ('t12_of02', 'T12 - OF02 - Other fees (amount)'),
            ('t13_st03', 'T13 - ST03 - Stamping tax (percentage)'),
            ('t14_st04', 'T14 - ST04 - Stamping Tax (amount)'),
            ('t15_ent03', 'T15 - Ent03 - Entertainment tax (rate)'),
            ('t15_ent04', 'T15 - Ent04 - Entertainment tax (amount)'),
            ('t16_rd03', 'T16 - RD03 - Resource development fee (rate)'),
            ('t16_rd04', 'T16 - RD04 - Resource development fee (amount)'),
            ('t17_sc03', 'T17 - SC03 - Service charges (rate)'),
            ('t17_sc04', 'T17 - SC04 - Service charges (amount)'),
            ('t18_mn03', 'T18 - Mn03 - Municipality Fees (rate)'),
            ('t18_mn04', 'T18 - Mn04 - Municipality Fees (amount)'),
            ('t19_mi03', 'T19 - MI03 - Medical insurance fee (rate)'),
            ('t19_mi04', 'T19 - MI04 - Medical insurance fee (amount)'),
            ('t20_of03', 'T20 - OF03 - Other fees (rate)'),
            ('t20_of04', 'T20 - OF04 - Other fees (amount)')
        ],
        string='ETA Code (Egypt)', default=False)


class AccountTax(models.Model):
    _name = 'account.tax'
    _inherit = ['account.tax', 'l10n_eg.eta.account.tax.mixin']


class AccountTaxTemplate(models.Model):
    _name = 'account.tax.template'
    _inherit = ['account.tax.template', 'l10n_eg.eta.account.tax.mixin']

    def _get_tax_vals(self, company, tax_template_to_tax):
        vals = super(AccountTaxTemplate, self)._get_tax_vals(company, tax_template_to_tax)
        vals.update({
            'l10n_eg_eta_code': self.l10n_eg_eta_code,
        })
        return vals
