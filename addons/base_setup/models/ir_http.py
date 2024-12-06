# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def lazy_session_info(self):
        result = super().lazy_session_info()
        if self.env.user._is_internal():
            result['show_effect'] = bool(self.env['ir.config_parameter'].sudo().get_param('base_setup.show_effect'))
        return result
