# -*- coding: utf-8 -*-
from odoo import models


class IrQweb(models.AbstractModel):
    _inherit = "ir.qweb"

    def _get_bundles_to_pregenerate(self):
        js_assets, css_assets = super()._get_bundles_to_pregenerate()
        assets = {'mass_mailing.iframe_css_assets_edit'}
        return (js_assets | assets, css_assets | assets)
