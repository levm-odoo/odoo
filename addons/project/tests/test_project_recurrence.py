# -*- coding: utf-8 -*-

from odoo import fields
from odoo.tests.common import Form, TransactionCase

from datetime import datetime, time
from dateutil.relativedelta import relativedelta
from freezegun import freeze_time


class TestProjectRecurrence(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super(TestProjectRecurrence, cls).setUpClass()

        cls.env.user.groups_id += cls.env.ref('project.group_project_recurring_tasks')

        cls.stage_a = cls.env['project.task.type'].create({'name': 'a'})
        cls.stage_b = cls.env['project.task.type'].create({'name': 'b'})
        cls.project_recurring = cls.env['project.project'].with_context({'mail_create_nolog': True}).create({
            'name': 'Recurring',
            'type_ids': [
                (4, cls.stage_a.id),
                (4, cls.stage_b.id),
            ]
        })

        cls.classPatch(cls.env.cr, 'now', fields.Datetime.now)

        cls.date_01_01 = datetime.combine(datetime.now() + relativedelta(years=-1, month=1, day=1), time(0, 0))

    def test_recurrence_simple(self):
        with freeze_time(self.date_01_01):
            form = Form(self.env['project.task'])
            form.name = 'test recurring task'
            form.project_id = self.project_recurring
            form.recurring_task = True
            form.repeat_interval = 5
            form.repeat_unit = 'month'
            form.repeat_type = 'forever'
            task = form.save()

            self.assertTrue(bool(task.recurrence_id), 'should create a recurrence')

            task.write(dict(repeat_interval=2))
            self.assertEqual(task.recurrence_id.repeat_interval, 2, 'recurrence should be updated')

            task.recurring_task = False
            self.assertFalse(bool(task.recurrence_id), 'the recurrence should be deleted')

    def test_recurrent_tasks_fields(self):
        with freeze_time(self.date_01_01):
            form = Form(self.env['project.task'])
            form.project_id = self.project_recurring
            form.name = 'name'
            form.description = 'description'
            form.priority = '1'
            form.stage_id = self.stage_b
            form.tag_ids.add(self.env['project.tags'].search([], limit=1))
            form.date_deadline = self.date_01_01 + relativedelta(weeks=1)

            form.recurring_task = True
            form.repeat_interval = 2
            form.repeat_unit = 'month'
            form.repeat_type = 'forever'
            task = form.save()

        with freeze_time(self.date_01_01 + relativedelta(months=1)):
            task.state = '1_done'
        other_task = task.recurrence_id.task_ids - task

        self.assertEqual(
            other_task.date_deadline, task.date_deadline + relativedelta(months=2),
            "Next occurrence should have previous deadline + interval * unit",
        )
        for copied_field in ['project_id', 'name', 'description', 'tag_ids']:
            self.assertEqual(other_task[copied_field], task[copied_field], f"Next occurrence's {copied_field} should have been copied")

        for reset_field in ['priority', 'stage_id', 'state']:
            self.assertNotEqual(other_task[reset_field], task[reset_field], f"Next occurrence's {reset_field} should have been reset")

    def test_recurrence_until(self):
        with freeze_time(self.date_01_01):
            form = Form(self.env['project.task'])
            form.name = 'test recurring task'
            form.project_id = self.project_recurring
            form.recurring_task = True
            form.repeat_interval = 5
            form.repeat_unit = 'month'
            form.repeat_type = 'until'
            form.repeat_until = self.date_01_01 + relativedelta(months=1)
            task = form.save()

        with freeze_time(self.date_01_01 + relativedelta(days=30)):
            task.state = '1_done'
        self.assertEqual(len(task.recurrence_id.task_ids), 2, "Since this is before repeat_until, next occurrence should have been created")

        with freeze_time(self.date_01_01 + relativedelta(days=32)):
            task.state = '1_done'
        self.assertEqual(len(task.recurrence_id.task_ids), 2, "Since this is after repeat_until, next occurrence shouldn't have been created")

    def test_recurring_settings_change(self):
        self.env['res.config.settings'] \
            .create({'group_project_recurring_tasks': True}) \
            .execute()
        test_task = self.env['project.task'].create({
            'name': "Recurring Task",
            'project_id': self.project_recurring.id,
            'recurring_task': True,
        })
        self.assertTrue(test_task.recurring_task, 'The "Recurring" feature should be enabled from settings.')
        self.env['res.config.settings'] \
            .create({'group_project_recurring_tasks': False}) \
            .execute()
        self.assertFalse(test_task.recurring_task, 'The "Recurring" feature should not be enabled by default.')

    def test_recurrence_disabled_with_single_task(self):
        config_settings = self.env['res.config.settings'].create({'group_project_recurring_tasks': True})
        config_settings.execute()
        with freeze_time(self.date_01_01):
            form = Form(self.env['project.task'])
            form.name = 'recurring task'
            form.project_id = self.project_recurring
            form.recurring_task = True
            form.repeat_interval = 5
            form.repeat_unit = 'month'
            form.repeat_type = 'forever'
            task = form.save()
        self.assertTrue(task.recurrence_id, 'Should create a recurrence')
        config_settings = self.env['res.config.settings'].create({'group_project_recurring_tasks': False})
        config_settings.execute()
        self.assertFalse(task.recurring_task, 'Recurrence should be disabled')

    def test_recurrence_disabled_multi_tasks(self):
        config_settings = self.env['res.config.settings'].create({'group_project_recurring_tasks': True})
        config_settings.execute()
        with freeze_time(self.date_01_01):
            form = Form(self.env['project.task'])
            form.name = 'recurring task'
            form.project_id = self.project_recurring
            form.recurring_task = True
            form.repeat_interval = 5
            form.repeat_unit = 'month'
            form.repeat_type = 'forever'
            task = form.save()
        with freeze_time(self.date_01_01 + relativedelta(months=1)):
            task.state = '1_done'
            form.save()
        task2 = task.recurrence_id.task_ids.filtered(lambda t: t.id != task.id)
        task2.recurring_task = False
        form.save()
        self.assertTrue(task.recurrence_id, 'Recurrence id should be in tasks')
        self.assertTrue(task2.recurrence_id, 'Recurrence id should be in tasks')
        with freeze_time(self.date_01_01 + relativedelta(months=2)):
            task2.state = '1_done'
            form.save()
        task3 = task.recurrence_id.task_ids.filtered(lambda t: t.id not in [task2.id, task.id])
        self.assertFalse(task3, 'The task should not be created')
