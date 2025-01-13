from odoo import fields, models


class TestAsyncQueue(models.Model):
    _name = 'test_new_api.async.queue'
    _description = 'test_new_api.async.queue'

    processed = fields.Integer()
    active = fields.Boolean(default=True)

    def _process_record(self):
        self.processed += 1
