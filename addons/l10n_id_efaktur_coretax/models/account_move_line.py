from odoo import models
from odoo.tools import float_round, float_repr

class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    def _prepare_efaktur_vals(self):
        """" Convert invoice lines to dictionary following the format of E-Faktur"""

        line_vals = []
        idr = self.env.ref('base.IDR')

        for line in self:
            product = line.product_id
            trx_code = line.move_id.l10n_id_kode_transaksi

            vals = {
                "Opt": "B" if product.detailed_type == "service" else "A",  # A: goods, B: service
                "Code": product.l10n_id_product_code.code or self.env.ref('l10n_id_efaktur_coretax.product_code_000000_goods').code,
                "Name": product.name,
                "Unit": line.product_uom_id.l10n_id_uom_code.code,
                "Price": float_repr(idr.round(line.price_unit), idr.decimal_places),
                "Qty": line.quantity,
                "TotalDiscount": idr.round(line.discount * line.quantity * line.price_unit / 100),
                "TaxBase": idr.round(line.price_subtotal),  # DPP
                "VATRate": 12,
                "STLGRate": line.move_id.l10n_id_stlg_rate,
                # "STLG": 0,
            }

            # set OtherTaxBase and VAT depending on the transaction code
            if trx_code == "04":
                vals["OtherTaxBase"] = idr.round(line.price_subtotal * 11 / 12)
                vals["VAT"] = idr.round(vals["OtherTaxBase"] * vals["VATRate"] / 100)  # TaxBase * VATRate
            else:
                vals["OtherTaxBase"] = vals["TaxBase"]
                vals["VAT"] = idr.round(vals["TaxBase"] * line.tax_ids.amount / 100)
            vals['STLG'] = idr.round(vals['STLGRate'] * vals['OtherTaxBase'] / 100)

            line_vals.append(vals)

        return line_vals
