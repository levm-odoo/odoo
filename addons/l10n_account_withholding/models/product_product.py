# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models, api


class ProductTemplate(models.Model):
    """
    We want to keep the product view clean and simple to use. This means that adding new fields for withholding taxes
    is not acceptable.
    We also cannot easily reuse the taxes_id/supplier_taxes_id fields as adding taxes in them would cause these taxes to
    affect a lot of other flows (POS, eCommerce, etc.)
    Instead, we will replace the field in the view by a "new" field using the same table as the existing ones but which
    accepts both regular and withholding taxes.
    The existing fields now become a subset of that new field which only accepts regular taxes.
    And finally, we add another subset-field which only accepts withholding taxes.

    This way, we do not add any new fields in the view, nor table/column in the database and keep a easy-to-use
    interface while having the flexibility of choosing which field is used in which context.
    """
    _inherit = 'product.template'

    # ------------------
    # Fields declaration
    # ------------------

    # Sale taxes.
    all_taxes_id = fields.Many2many('account.tax', 'product_taxes_rel', 'prod_id', 'tax_id',
        string="All Sales Taxes",
        help="Default taxes used when selling the product",
        domain=[('type_tax_use', '=', 'sale')],
    )
    withholding_taxes_id = fields.Many2many('account.tax', 'product_taxes_rel', 'prod_id', 'tax_id',
        string="Withholding Sales Taxes",
        domain=[('type_tax_use', '=', 'sale'), ('l10n_account_wth_is_wth_tax', '=', True)],
    )
    taxes_id = fields.Many2many(
        domain=[('type_tax_use', '=', 'sale'), ('l10n_account_wth_is_wth_tax', '=', False)]
    )
    # Purchase taxes
    all_supplier_taxes_id = fields.Many2many('account.tax', 'product_supplier_taxes_rel', 'prod_id', 'tax_id',
        string="All Purchase Taxes",
        help="Default taxes used when buying the product",
        domain=[('type_tax_use', '=', 'purchase')],
    )
    supplier_withholding_taxes_id = fields.Many2many('account.tax', 'product_supplier_taxes_rel', 'prod_id', 'tax_id',
        string="Withholding Purchase Taxes",
        domain=[('type_tax_use', '=', 'purchase'), ('l10n_account_wth_is_wth_tax', '=', True)],
    )
    supplier_taxes_id = fields.Many2many(
        domain=[('type_tax_use', '=', 'purchase'), ('l10n_account_wth_is_wth_tax', '=', False)],
    )

    @api.model
    def default_get(self, fields_list):
        """ We need this little override to set the default value of the all_ taxes fields.
        We cannot rely on the default=xxx as we want the default to always be the same as the original fields, and we also do
        not want to add default taxes in the case where the original field gets a value provided at creation time.
        In practice, it works without this, but the values would only show when saving which is not ideal on a UX standpoint.
        """
        defaults = super().default_get(fields_list)
        if 'taxes_id' in defaults:
            defaults['all_taxes_id'] = defaults['taxes_id']
        if 'supplier_taxes_id' in defaults:
            defaults['all_supplier_taxes_id'] = defaults['supplier_taxes_id']
        return defaults
