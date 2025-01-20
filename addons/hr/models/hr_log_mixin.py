# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class HrLogMixin(models.AbstractModel):
    _name = 'hr.log.mixin'
    _description = 'HR Log Mixin'

    log_ids = fields.One2many('hr.log', compute='_compute_log_ids')

    def _compute_log_ids(self):
        self.log_ids = self.env['hr.log'].search([('model_id', '=', self.env['ir.model']._get_id(self._name)), ('record_id', '=', self.id)])
