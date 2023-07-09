from odoo import models, fields, _
from odoo.exceptions import UserError
from odoo.tools import float_is_zero

L10N_PT_ACCOUNT_TAX_REGIONS_SELECTION = [
    ('PT', 'Mainland Portugal'),
    ('PT-MA', 'Madeira'),
    ('PT-AC', 'Azores'),
]

L10N_PT_ACCOUNT_TAX_CATEGORIES_SELECTION = [
    ('N', 'Normal'),
    ('I', 'Intermediate'),
    ('R', 'Reduced'),
    ('E', 'Exempt'),
]

# https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Faturacao/Fatcorews/Documents/Tabela_Codigos_Motivo_Isencao.pdf
L10N_PT_TAX_EXEMPTION_REASONS_SELECTION = [
    ("M01", "M01 - Artigo 16.º, n.º 6 do CIVA ou similar"),
    ("M02", "M02 - Artigo 6.º do Decreto-Lei n.º 198/90, de 19 de Junho"),
    ("M03", "M03 - Exigibilidade de caixa (revogado)"),
    ("M04", "M04 - Artigo 13.º do CIVA ou similar"),
    ("M05", "M05 - Artigo 14.º do CIVA ou similar"),
    ("M06", "M06 - Artigo 15.º do CIVA ou similar"),
    ("M07", "M07 - Artigo 9.º do CIVA ou similar"),
    ("M08", "M08 - IVA - autoliquidação (revogado)"),
    ("M09", "M09 - IVA - não confere direito a dedução"),
    ("M10", "M10 - IVA - Regime de isenção (Artigo 57.º do CIVA)"),
    ("M11", "M11 - Regime particular do tabaco"),
    ("M12", "M12 - Regime da margem de lucro - Agências de viagens"),
    ("M13", "M13 - Regime da margem de lucro - Bens em segunda mão"),
    ("M14", "M14 - Regime da margem de lucro - Objetos de arte"),
    ("M15", "M15 - Regime da margem de lucro - Objetos de coleção e antiguidades"),
    ("M16", "M16 - Artigo 14.º do RITI ou similar"),
    ("M19", "M19 - Outras isenções"),
    ("M20", "M20 - IVA - regime forfetário"),
    ("M21", "M21 - IVA – não confere direito à dedução"),
    ("M25", "M25 - Mercadorias à consignação"),
    ("M30", "M30 - IVA - autoliquidação (2.1.i)"),
    ("M31", "M31 - IVA - autoliquidação (2.1.j)"),
    ("M32", "M32 - IVA - autoliquidação (2.1.l)"),
    ("M33", "M33 - IVA - autoliquidação (2.1.m)"),
    ("M40", "M40 - IVA - autoliquidação (6.6.a)"),
    ("M41", "M41 - IVA - autoliquidação (8.3.R)"),
    ("M42", "M42 - IVA - autoliquidação (21.2007)"),
    ("M43", "M43 - IVA - autoliquidação (362.99)"),
    ("M99", "M99 - Não sujeito; não tributado ou similar"),
]


class AccountTax(models.Model):
    _inherit = "account.tax"

    l10n_pt_account_tax_exemption_reason = fields.Selection(string="Tax Exemption Reason", selection=L10N_PT_TAX_EXEMPTION_REASONS_SELECTION)

    def write(self, vals):
        if not vals:
            return True
        for tax in self.filtered(lambda t: t.company_id.account_fiscal_country_id.code == 'PT'):
            if float_is_zero(tax.amount, precision_digits=2) and not tax.l10n_pt_account_tax_exemption_reason:
                raise UserError(_("According to Portuguese law, you must provide a tax exemption reason for the tax '%s'", tax.name))


class AccountTaxGroup(models.Model):
    _inherit = "account.tax.group"

    l10n_pt_account_tax_region = fields.Selection(string="Region", selection=L10N_PT_ACCOUNT_TAX_REGIONS_SELECTION)
    l10n_pt_account_tax_category = fields.Selection(string="Tax Category", selection=L10N_PT_ACCOUNT_TAX_CATEGORIES_SELECTION, required=True, default="N")
