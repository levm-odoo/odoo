from ast import literal_eval

from odoo import api, fields, models


class CrmLead(models.Model):
    _inherit = "crm.lead"

    channel_id = fields.Many2one(
        "discuss.channel",
        "Live chat from which the lead was created",
        readonly=True,
        groups="base.group_erp_manager",
        index="btree_not_null",
    )
    originates_from_livechat = fields.Boolean(compute="_compute_originates_from_livechat", groups="sales_team.group_sale_salesman", compute_sudo=True)

    @api.depends("channel_id")
    def _compute_originates_from_livechat(self):
        for lead in self:
            lead.originates_from_livechat = bool(lead.channel_id)

    def action_redirect_to_livechat_channel(self):
        action = self.env["ir.actions.actions"]._for_xml_id("mail.action_discuss")
        action["context"] = literal_eval(action.get("context", "{}"))
        # sudo - crm.lead: can read origin channel of the lead
        action["context"]["active_id"] = self.sudo().channel_id.id
        return action
