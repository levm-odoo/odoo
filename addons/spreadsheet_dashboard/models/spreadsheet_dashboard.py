import base64
import json

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

class SpreadsheetDashboard(models.Model):
    _name = 'spreadsheet.dashboard'
    _description = 'Spreadsheet Dashboard'
    _order = 'sequence'

    name = fields.Char(required=True)
    dashboard_group_id = fields.Many2one('spreadsheet.dashboard.group', required=True)
    data = fields.Binary(required=True, default=lambda self: self._default_data())
    raw = fields.Binary(compute='_compute_raw', inverse='_inverse_raw')
    thumbnail = fields.Binary()
    sequence = fields.Integer()
    group_ids = fields.Many2many('res.groups', default=lambda self: self.env.ref('base.group_user'))

    def _default_data(self):
        data = json.dumps(self._empty_workbook_data())
        return base64.b64encode(data.encode())

    def _empty_workbook_data(self):
        """Create an empty spreadsheet workbook.
        The sheet name should be the same for all users to allow consistent references
        in formulas. It is translated for the user creating the spreadsheet.
        """
        return {
            "version": 1,
            "sheets": [
                {
                    "id": "sheet1",
                    "name": _("Sheet1"),
                }
            ]
        }

    @api.depends('data')
    def _compute_raw(self):
        for dashboard in self:
            dashboard.raw = base64.decodebytes(dashboard.data)

    def _inverse_raw(self):
        for dashboard in self:
            dashboard.data = base64.encodebytes(dashboard.raw)

    @api.onchange('data')
    def _onchange_data_(self):
        if self.data:
            try:
                data_str = base64.b64decode(self.data).decode('utf-8')
                json.loads(data_str)
            except:
                raise ValidationError(_('Invalid JSON Data'))

    def copy(self, default=None):
        self.ensure_one()
        if default is None:
            default = {}
        if 'name' not in default:
            default['name'] = _("%s (copy)") % self.name
        return super().copy(default=default)
