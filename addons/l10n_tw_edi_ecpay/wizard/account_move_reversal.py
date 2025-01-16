# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class AccountMoveReversal(models.TransientModel):
    _inherit = "account.move.reversal"

    l10n_tw_edi_refund_agreement_type = fields.Selection(
        [("offline", "Offline"), ("online", "Online")],
        default="offline",
        string="Agreement Type",
        help="Refund invoice agreement type",
    )
    l10n_tw_edi_ecpay_invoice_id = fields.Char(compute="_compute_from_moves")

    def _compute_from_moves(self):
        super()._compute_from_moves()
        for record in self:
            record.l10n_tw_edi_ecpay_invoice_id = record.move_ids._origin.l10n_tw_edi_ecpay_invoice_id

    def _prepare_default_reversal(self, move):
        res = super()._prepare_default_reversal(move)
        res.update({
            "l10n_tw_edi_origin_invoice_number_id": move.id,
            "l10n_tw_edi_ecpay_invoice_id": move.l10n_tw_edi_ecpay_invoice_id,
            "l10n_tw_edi_invoice_create_date": move.l10n_tw_edi_invoice_create_date,
            "l10n_tw_edi_refund_agreement_type": self.l10n_tw_edi_refund_agreement_type,
        })
        return res

    def _modify_default_reverse_values(self, origin_move):
        values = super()._modify_default_reverse_values(origin_move)
        origin_move._l10n_tw_edi_run_invoice_invalid()
        origin_move.l10n_tw_edi_state = "invalid"
        return values
