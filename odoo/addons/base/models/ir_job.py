from odoo import api, fields, models


class IrJob(models.Model):
    _name = 'ir.job'
    _description = "Scheduled Jobs"
    _allow_sudo_commands = False
    _order = 'scheduled_date, id'

    ir_actions_server_id = fields.Many2one(
        'ir.actions.server', 'Server Action',
        ondelete='cascade',
        required=True,
        index=True,
    )

    scheduled_date = fields.Datetime(required=True)
    estimated_end_date = fields.Datetime(
        required=True,
        compute='_compute_estimated_end',
        store=True,
        precompute=True,
    )

    records = fields.Json(required=True)
    domain = fields.Char()
    model_id = fields.Many2one(related="ir_actions_server_id.model_id")

    run_uid = fields.Many2one(
        'res.users', "Run As", required=True, default=lambda self: self.env.ref('base.user_root')
    )
    state = fields.Selection(
        [
            ('scheduled', 'Scheduled'),
            ('done', 'Done'),
            ('error', 'Failed'),
            ('cancel', 'Cancelled'),
        ],
        required=True,
        index=True,
        default="scheduled",
    )
    result = fields.Json(readonly=True)
    run_date = fields.Datetime()
    duration = fields.Float(readonly=True, help="Duration in seconds")

    _scheduled_index = models.UniqueIndex("(scheduled_date, estimated_end_date, id) WHERE state = 'scheduled'")

    @api.depends('scheduled_date', 'ir_actions_server_id')
    def _compute_estimated_end(self):
        for job in self:
            job.estimated_end_date = job.scheduled_date

    @classmethod
    def _process_jobs(cls, db_name):
        ...
