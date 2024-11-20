# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models
from ..websocket import WebsocketConnectionHandler


class Http(models.AbstractModel):
    _inherit = "ir.http"

    @api.model
    def get_frontend_session_info(self):
        session_info = super().get_frontend_session_info()
        session_info["websocket_worker_version"] = WebsocketConnectionHandler._VERSION
        autovacuum_job = self.env.ref("base.autovacuum_job")
        session_info["autovacuum_info"] = {
            "id": autovacuum_job.id,
            "lastcall": str(autovacuum_job.lastcall),
            "nextcall": str(autovacuum_job.nextcall),
        }
        return session_info

    def session_info(self):
        session_info = super().session_info()
        session_info["websocket_worker_version"] = WebsocketConnectionHandler._VERSION
        autovacuum_job = self.env.ref("base.autovacuum_job")
        session_info["autovacuum_info"] = {
            "id": autovacuum_job.id,
            "lastcall": str(autovacuum_job.lastcall),
            "nextcall": str(autovacuum_job.nextcall),
        }
        return session_info
