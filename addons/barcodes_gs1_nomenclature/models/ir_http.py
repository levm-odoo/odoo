# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def session_info(self):
        res = super().session_info()
        # nomenclature = self.env.company.sudo().nomenclature_id
        # if not nomenclature.is_combined:
        #     return res
        # res['gs1_group_separator_encodings'] = nomenclature.separator_expr
        return res
