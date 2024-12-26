from odoo import models, api


class ResCountry(models.Model):
    _name = 'res.country'
    _inherit = ['res.country', 'pos.load.mixin']

    @api.model
    def _load_pos_self_data_fields(self, config_id):
        fields = super()._load_pos_self_data_fields(config_id)
        return fields + ["state_ids"]
