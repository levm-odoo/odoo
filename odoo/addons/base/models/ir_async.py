# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import time
from uuid import uuid4

from odoo import api, fields, models
from odoo.fields import Domain
from odoo.tools import split_every

_logger = logging.getLogger(__name__)


class FutureResult:
    def __init__(self, record):
        record.ensure_one()
        self.model = record._name
        self.id = record.id
        ...

    def job(self, env, *, check_ready=True):
        job = env[self.model].browse(self.id)
        if check_ready and job.job_state != 'done':
            raise ValueError(f"Job not finished {self!r}")
        return job

    def to_response(self, adapter=None):
        # XXX make a proper HTTP response after running the job
        from http import request  # noqa: PLC0415
        with request.registry.cursor() as cr:
            env = cr  # XXX Environment()
            job = self._execute_job(env, must_succeed=True)
            payload = job if adapter is None else adapter(job)
            return payload  # XXX return http_response(payload)

    def post_commit(self, env, **kw):
        env.cr.post_commit.add(lambda: self._execute_job(env, **kw))

    def _execute_job(self, env, *, must_succeed=False):
        job = env[self.model].browse(self.id)
        # XXX check queued and locked
        job._process_record()
        return job

    def __repr__(self):
        return f"FutureResult:{self.model}.{self.id}"


class IrAsyncJob(models.AbstractModel):
    """ Helper model to the ``@api.autovacuum`` method decorator. """
    _name = 'ir.async.job'
    _description = 'Async Job'
    _async_job_batch_size = 1

    uuid = fields.Char('UUID', copy=False, readonly=True)  # XXX make a separate abstract model?
    job_state = fields.Selection([
        ('queued', 'Queued'),
        ('done', 'Done'),
        ('fail', 'Failed'),
        ('cancel', 'Cancelled'),
    ], default='queued', required=True, copy=False, readonly=True)
    job_error = fields.Text(copy=False, readonly=True)
    job_failed_count = fields.Integer(copy=False, readonly=True)

    _result_uuid_unique = models.Constraint('UNIQUE (uuid)')

    def _process_async(self):
        raise NotImplementedError('abstract method')

    def _on_job_success(self):
        assert self.ensure_one().job_state == 'queued'
        self.write({
            'job_state': 'done',
            'job_error': False,
        })

    def _on_job_error(self, exc, state=None):
        assert self.ensure_one().job_state == 'queued'
        count = self.job_failed_count + 1
        if state is None:
            state = 'fail' if count >= 3 else 'queued'
        self.write({
            'job_state': state,
            'job_error': str(exc),  # XXX with stack trace
            'job_failed_count': count,
        })

    def precondition(self) -> Domain:
        if self._active_name:
            return Domain(self._active_name, '=', True)
        return Domain.TRUE

    def exists_lock(self):
        # XXX real implem
        return self.exists()

    def _process_recordset(self):
        assert 0 < len(self) <= self._async_job_batch_size
        self._process_async()

    # TODO @api.cron
    def _cron_process(self, *, fetch_size=1000, search_domain=Domain.TRUE):
        search_domain &= Domain('job_state', '=', 'queued')
        jobs = self.search(search_domain, limit=fetch_size)
        if not jobs:
            return

        remaining = len(jobs)
        if self._async_job_batch_size > 1:
            jobs = split_every(self._async_job_batch_size, jobs, jobs.browse)

        end_time = self.env.context.get('cron_end_time')
        cr = self.env.cr
        done = 0
        for jobset in jobs:
            jobset = jobset.exists_lock()
            remaining -= len(jobset)
            # XXX cannot get lock
            jobset = jobset.filtered_domain(search_domain).with_prefetch()
            if not jobset:
                cr.commit()
                continue
            start_time = time.monotonic()
            jobset = jobset.with_context(job_start_time=start_time, job_duration=None)
            try:
                with cr.savepoint():
                    jobset._process_record()
            except Exception as exc:
                jobset = jobset.with_context(job_duration=time.monotonic() - start_time)
                jobset._on_job_error(exc)
            else:
                jobset = jobset.with_context(job_duration=time.monotonic() - start_time)
                jobset._on_job_success()
                done += len(jobset)
            finally:
                self.env['ir.cron']._notify_progress(done=done, remaining=remaining)
                cr.commit()
            if end_time and time.time() >= end_time:
                break

        if remaining != 0:
            # this means some records where locked, in that case, do not retry
            remaining = 0
        else:
            remaining = self.search_count(search_domain)
        self.env['ir.cron']._notify_progress(done=done, remaining=remaining)

    def trigger(self, *, soon=False):
        if not any(job.job_state == 'queued' for job in self):
            return
        self._cron_process.trigger(soon=soon)

    def future(self):
        return FutureResult(self)

    def ensure_uuid(self):
        for job in self:
            if not job.uuid:
                job.uuid = uuid4().hex
        return self.uuid if len(self) == 1 else None

    def retry(self, include_done=True):
        jobs = self.filtered(lambda job: job.job_state != 'queued' and (include_done or job.job_state != 'done'))
        jobs.job_state = 'queued'
        return jobs

    def cancel(self):
        jobs = self.filtered(lambda job: job.job_state == 'queued')
        jobs.job_state = 'cancel'
