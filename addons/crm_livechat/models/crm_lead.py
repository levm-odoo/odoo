import json

from odoo import fields, models

class CrmLead(models.Model):
    _inherit = "crm.lead"

    channel_id = fields.Many2one("discuss.channel", "Live chat from which the lead was created")

    def action_redirect_to_livechat_channel(self):
        action = self.env["ir.actions.actions"]._for_xml_id("mail.action_discuss")
        action["context"] = json.loads(action.get("context", "{}"))
        action["context"]["active_id"] = self.channel_id.id
        return action
