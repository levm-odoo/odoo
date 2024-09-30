# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api


def migrate(cr, version):
    env = api.Environment(cr, api.SUPERUSER_ID, {})
    for company in env['res.company'].search([('chart_template', '=', 'pk')], order="parent_path"):
        env['account.chart.template'].try_loading('pk', company)
