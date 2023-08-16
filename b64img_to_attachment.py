"""
For odoo version 16.3

This set of utils is meant to be used within the odoo shell environment.
The goal is to convert base64-encoded images in html fields to attachments.

Usage:

run_fields( env,
            [('project.task', 'description'),('crm.lead', 'description')],
            batch_size=100, retries=3)

    Processes each (model, field) in batches of size up to 100.
    Failed batches are retried up to 3 times.

    Returns a report object that can be pickled.

 
The `get_html_fields` function is available for discovering all html fields
in the database.
But caution is advised when passing the result of this function call as
parameter to `run_fields`, as it might not make sense to convert some of
those fields.
Running a carefully selected list of (res_model, field) is recommended instead.
    

Summary:

    Candidate records are searched using a simple pattern for matching with
    the LIKE operator. Only their id is fetched from the database.
    Once the (potentially large) list of ids is obtained, it is split into small
    batches of records to process.

    Each batch consists of a DB transaction, in which:
        - The content of the target field of those records is fetched with a
        single SELECT query,
        - A (very specific) regex pattern is used to find occurrences of base64-
        encoded images it that content,
        - A single batch of ir.attachments is created using the ORM,
        - Each record's new content is generated by replacing the image souces
        by the attachments' urls,
        - The field content is updated with a single UPDATE...FROM query.

    Database writes are only done by `run_batch` and its callee `convert`.

    One batch == one transaction
    Larger batch size ==    less DB server round trips,
                            more memory usage (beware of translated fields).

"""

import re
import hashlib
import time
import logging
from base64 import b64decode
from collections import defaultdict
from math import ceil
from psycopg2 import sql
from psycopg2.extras import execute_values, Json
from odoo.tools.mimetypes import guess_mimetype
from odoo.addons.web_editor.models.ir_attachment import SUPPORTED_IMAGE_MIMETYPES

LOG_PATH = "base64img_to_attachment.log"

def run_fields(env, fields, batch_size=100, retries=3):
    """
    :param: fields: [(res_model, field)]
    """
    like_pattern = "%src=_data:image/%"
    reports = []
    for res_model, field in fields:
        try:
            table = env[res_model]._table
        except Exception as e:
            logger.error(f"Bad res_model: {res_model}, skipping it.")
            continue
        # Find candidate records.
        record_ids, data_type = search_records(env.cr, table, field, like_pattern)
        if not record_ids:
            continue
        field_info = (res_model, table, field, data_type)
        # Process them in batches.
        batch_reports = run_in_batches(env, field_info, record_ids, batch_size)
        reports.extend(batch_reports)
    
    failed_batches = retry_failed_batches(env, reports, retries)
    return generate_agg_report(reports, failed_batches)

# This is likely to be the longest transaction, but it shouldn't lock anything as it
# is just a SELECT query.
def search_records(cr, table, field, like_pattern):
    """
    Search records for pattern with LIKE.
    Return list of ids and (postgresql) data type.
    Data types other than 'text' and 'jsonb' are not supported for searching,
    returning an empty list.
    """
    data_type = get_data_type(cr, table, field)
    if not data_type:
        logger.error(f"{table}.{field} does not exist.")
        return [], None

    if data_type == 'text':
        query_template = """
              SELECT id
                FROM {table}
               WHERE {field}
                LIKE %s
            ORDER BY id
        """
    elif data_type == 'jsonb':
        # Check first key only.
        query_template = """
              SELECT id
                FROM {table}
               WHERE {field} ->> (SELECT jsonb_object_keys({field}) LIMIT 1)
                LIKE %s
            ORDER BY id
        """
    else:
        logger.warning(f"{table}.{field}: data type {data_type} not supported.")
        return [], None

    logger.info(f"{table}.{field}: searching for pattern '{like_pattern}'... ")

    cr.execute(sql.SQL(query_template).format(
        table=sql.Identifier(table),
        field=sql.Identifier(field),
    ), [like_pattern])
    ids = [id for (id,) in cr.fetchall()]

    cr.commit()

    logger.info(f"{table}.{field}: {len(ids)} records found.\n")
    return ids, data_type

def run_in_batches(env, field_info, record_ids, batch_size):
    """
    :param: field_info: (res_model, table, field, data_type)
    """
    assert batch_size > 0, "Batch size must be > 0"

    batches = []
    while record_ids:
        batch_ids = record_ids[:batch_size]
        record_ids[:] = record_ids[batch_size:]
        batches.append(batch_ids)

    return [run_batch(env, (*field_info, batch_ids)) for batch_ids in batches]
    
# This function is decorated with _log_batch
def run_batch(env, batch_params):
    """
    :param: batch_params: (res_model, table, field, data_type, ids)
    """
    cr = env.cr
    res_model, table, field, data_type, ids = batch_params

    select_query = sql.SQL("""
        SELECT id, {field} 
          FROM {table}
         WHERE id = ANY(%s)
    """).format(
        table=sql.Identifier(table),
        field=sql.Identifier(field),
    )
    cr.execute(select_query, [ids])
    rows = cr.fetchall()

    # jsonb fields need to be adapted.
    rows = from_jsonb(rows) if data_type == 'jsonb' else rows
    id_to_res_id = (lambda id: id[0]) if data_type == 'jsonb' else lambda id: id

    try:
        new_rows, report = convert(env, res_model, rows, id_to_res_id)
    except Exception as e:
        # Created ir_attachments are handled by the rollback.
        # Created files are garbage collected.
        cr.rollback()
        logger.exception(e)
        return ErrorReport("convertion to attachment", batch_params, e)

    update_query = sql.SQL("""
        UPDATE {table}
           SET {field} = data.content
          FROM (VALUES %s) AS data (id, content)
         WHERE {table}.id = data.id
    """).format(
        table=sql.Identifier(table),
        field=sql.Identifier(field),
    )

    template = "(%s, %s::jsonb)" if data_type == 'jsonb' else None
    new_rows = to_jsonb(new_rows) if data_type == 'jsonb' else new_rows

    # Filter out unchanged rows
    new_rows = [new_row for row, new_row in zip(rows, new_rows) if new_row[1] != row[1]]

    try:
        execute_values(cr._obj, update_query, new_rows, template)
    except Exception as e:
        cr.rollback()
        logger.exception(e)
        return ErrorReport("UPDATE query", batch_params, e)
    else:
        cr.commit()
    
    return SuccessReport(batch_params, new_rows, report)


"""
Regex pattern for matching `img` elements containing a base64-encoded image
as its `src`.
"""
regex_pattern = re.compile(r"""
    <img                        # 'img' element opening tag
    \s                          # Whitespace
    [^>]*?                      # Anything except closing tag, lazy
    src=                        # 'src' attribute
    (?P<quote>['"])             # Single or double quote
    (?P<src>                    # 'src' value  
        data:image/
        (?:gif|jpe|jpe?g|png|svg(?:\+xml)?) # Allowed MIME types
        ;base64,
        (?P<b64data>[A-Za-z0-9+/=]+)        # Base64-encoded image
    )
    (?P=quote)
    [^<]*?                      # Anything except opening tag, lazy
    >                           # Closing tag
""", re.VERBOSE) 


def convert(env, res_model, rows, id_to_res_id):
    """
    :param: rows: [(id, content)]
    id can be res_id or a (res_id, lang) pair
    :return: [(id, new_content)], report 

    Looks for occurrences of b64-encoded images in contents, creates attachments
    and returns new contents with replaced image sources.
    Created ir.attachment records are not commited (the caller should do it).

    Multiple identical images within a record create a single attachment.
    This is particular important for translated fields.
    """
    # Find occurrences of b64 images.
    replacements = defaultdict(list)
    vals_for_attachment = {} # {img_id: vals}, img_id = (res_id, img_sha)
    for id, content in rows:
        res_id = id_to_res_id(id)
        if not content:
            continue
        for match in re.finditer(regex_pattern, content):
            src_span = match.span('src')
            b64_encoded_image = match.group('b64data')
            try:
                bin_data = b64decode(b64_encoded_image)
                img_sha = hashlib.sha1(bin_data).hexdigest()
                img_id = (res_id, img_sha)
                # Avoid creation of multiple attachments for same image within a record.
                if img_id not in vals_for_attachment:
                    vals = get_vals_for_attachment(bin_data, res_model, res_id)
                    vals_for_attachment[img_id] = vals
            except Exception as e:
                logger.warning(f"Skipping bad image in {id}: {b64_encoded_image[:20]}...{b64_encoded_image[-20:]} {e}")
                continue
            else:
                replacements[id].append((src_span, img_id))
    
    # Create attachments
    img_id, vals_list = [*zip(*vals_for_attachment.items())] or ([], [])
    attachments = env['ir.attachment'].with_context(no_document=True).create(vals_list)
    attachments.generate_access_token()
    img_srcs = [f"{attach.image_src}?access_token={attach.access_token}" for attach in attachments]
    new_srcs = dict(zip(img_id, img_srcs))

    # Replace srcs in content
    report = {'created_ir_attachments': attachments.mapped('id'), 'delta_size': 0}
    new_rows = []
    for id, content in rows:
        new_content, delta_size = apply_replacements(content, replacements[id], new_srcs)
        new_rows.append((id, new_content))
        report['delta_size'] += delta_size
    return new_rows, report

def from_jsonb(rows):
    """
    Returns a list of (id, text_content) tuples, in which id is a 
    (record_id, language) tuple.

    [(1, {'en_US': 'abc', 'fr_BE': 'def'})] -> [((1, 'en_US'), 'abc'), 
                                                ((1, 'fr_BE'), 'def')]
    """
    return [((id, lang), content) for id, obj in rows
                                    for lang, content in obj.items()]

def to_jsonb(rows):
    """
    Reverse operation of `_from_jsonb`.
    Returns a list of tuples ready to be passed as values to the UPDATE query.
    """
    id_to_obj = defaultdict(dict)
    for (id, lang), content in rows:
        id_to_obj[id][lang] = content
    return [(id, Json(obj)) for id, obj in id_to_obj.items()]

def apply_replacements(text, replacements, new_srcs):
    shift_index = 0
    for span, img_id in replacements:
        new_src = new_srcs[img_id]
        start, end = map(lambda i: i + shift_index, span)
        text = text[:start] + new_src + text[end:]
        shift_index += len(new_src) - (end - start)
    return text, shift_index

def get_vals_for_attachment(bin_data, res_model, res_id):
    mimetype = guess_mimetype(bin_data)
    if mimetype not in SUPPORTED_IMAGE_MIMETYPES:
        raise ValueError("MIME type not supported")
    extension = SUPPORTED_IMAGE_MIMETYPES[mimetype]
    name = f"extracted_img{get_next_img_seq():06}{extension}"
    return {
        'name': name,
        'res_model': res_model,
        'res_id': res_id,
        'raw': bin_data
    }

img_seq = 1

def get_next_img_seq():
    global img_seq
    result = img_seq
    img_seq += 1
    return result

def set_next_img_seq(seq):
    global img_seq
    img_seq = seq

def get_data_type(cr, table, column):
    cr.execute("""
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = %s
        AND column_name = %s
    """, [table, column])
    result = cr.fetchone()
    cr.commit()
    if result:
        return result[0]
    return None

def retry_failed_batches(env, reports, retries):
    """
    Retries failed batches up to `retries` times.
    Failed batches are split in two before a retry.
    Returns list of failed batches after all retries.
    """
    failed_batches = [report.batch_params for report in reports if isinstance(report, ErrorReport)]
    if failed_batches:
        logger.info(f"Retrying failed batches\n")
    return _retry(env, reports, failed_batches, retries)

def _retry(env, reports, batches, retries):
    if not batches or not retries:
        return batches
    new_reports = []
    for batch_params in batches:
        field_info, ids = batch_params[:4], batch_params[4]
        # Split batch into 2
        batch_size = ceil(len(ids) / 2)
        r = run_in_batches(env, field_info, ids, batch_size)
        new_reports.extend(r)

    reports.extend(new_reports)
    failed_batches = [report.batch_params for report in new_reports if isinstance(report, ErrorReport)]
    return _retry(env, reports, failed_batches, retries - 1)


# Reports 

class ErrorReport:
    def __init__(self, step, batch_params, e):
        self.step = step
        self.batch_params = batch_params
        self.exception = e

class SuccessReport:
    def __init__(self, batch_params, new_rows, conversion_report):
        self.batch_params = batch_params
        self.updated_record_ids = [id for id, _ in new_rows]
        self.created_ir_attachment_ids = conversion_report['created_ir_attachments']
        self.delta_size_MB = conversion_report['delta_size'] / (1024 * 1024)

def generate_agg_report(reports, failed_batches):
    stats = {
        'fields': {},
        'ir_attachments_created': [],
        'total_delta_size_MB': 0,
        'batch_reports': reports,
    }
    for report in (r for r in reports if isinstance(r, SuccessReport)):
        res_model, table, field, data_type, ids = report.batch_params
        if (res_model, field) not in stats['fields']:
            stats['fields'][(res_model, field)] = {
            'updated_records': [],
            'delta_size_MB': 0,
            'failed_to_update_records': []
        }
        stats['fields'][(res_model, field)]['updated_records'].extend(report.updated_record_ids)
        stats['fields'][(res_model, field)]['delta_size_MB'] += report.delta_size_MB
        stats['ir_attachments_created'].extend(report.created_ir_attachment_ids)
        stats['total_delta_size_MB'] += report.delta_size_MB
    
    for batch_params in failed_batches:
        res_model, table, field, data_type, ids = batch_params
        stats['fields'][(res_model, field)]['failed_to_update_records'].extend(ids)

    log_agg_report(stats)
    return stats


# Logging

def setup_logger():
    logger = logging.getLogger(__name__)
    logger.propagate = False
    logger.setLevel(logging.INFO)

    file_handler = logging.FileHandler(LOG_PATH)
    formatter = logging.Formatter('%(asctime)s,%(msecs)03d %(levelname)s: %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    formatter = logging.Formatter('%(levelname)s: %(message)s')
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    return logger

logger = setup_logger()

def log_agg_report(stats):
    summary = "=== Summary ==="
    for (res_model, field), val in stats['fields'].items():
        summary += f"\n{res_model}.{field}: {len(val['updated_records'])} records updated, " + \
                f"delta size: {val['delta_size_MB']:.1f} MB."
    
    summary += f"\nTotal delta_size: {stats['total_delta_size_MB']:.1f} MB"
    summary += f"\nir.attachment: {len(stats['ir_attachments_created'])} records created"

    for (res_model, field), val in stats['fields'].items():
        failed_ids = val['failed_to_update_records']
        if failed_ids:
            summary += f"\n{res_model} {field}: failed to update {len(failed_ids)} records: {failed_ids}"

    logger.info(summary)
    log_next_img_seq()

def log_batch(func):
    """
    Decorator for logging each batch run.
    """
    def wrapper(*args, **kwargs):
        _, batch_params = args
        res_model, table, field, data_type, ids = batch_params
        id_range = f"{ids[0]} - {ids[-1]}" if len(ids) > 1 else f"{ids[0]}" if ids else ""
        logger.info(f"Starting batch: {res_model} {field} ({id_range}), {len(ids)} records")
        start_time = time.time()

        report = func(*args, **kwargs)

        end_time = time.time()
        execution_time = end_time - start_time
        if isinstance(report, ErrorReport):
            logger.warning(f"Batch {table}.{field} ({id_range}) failed at {report.step} after {execution_time:.3f} seconds\n")
        elif isinstance(report, SuccessReport):
            logger.info(f"Batch {res_model} {field} ({id_range}) completed in {execution_time:.3f} seconds"
            f"\nUpdated records ({len(report.updated_record_ids)}): {report.updated_record_ids}"
            f"\nCreated ir.attachment records ({len(report.created_ir_attachment_ids)}): {report.created_ir_attachment_ids}"
            # Assuming 1 char == 1 byte.
            # Should be ok with UTF-8 encoding, base64 encoding uses ASCII chars only.
            f"\nEstimated delta size in {table} table: {report.delta_size_MB:.1f} MB\n")
        return report
    return wrapper

# Decorate run_batch function
# The @decorator syntax would require to define the decorator before the
# decorated function (and I'd rather leave the top of the file clean-ish). 
run_batch = log_batch(run_batch)

def log_next_img_seq():
    logger.info(f"Next image seq: {img_seq}. Call `set_next_img_seq({img_seq})`"
                " when about to run this script in a new shell session to avoid duplicate attachment names.")

# Extras

def get_html_fields(env):
    """
    :return: [(res_model, field)]

    Returns a list of (res_model, field_name) pairs for html fields found in
    the database.
    """
    html_fields = env['ir.model.fields'].search([
        ('ttype', '=', 'html'),
        ('store', '=', True),
    ])
    models_and_fields = [(env[field.model_id.model], field) for field in html_fields]

    def _field_filter(model_field):
        model, _ = model_field
        if model._transient:
            return False
        if not table_exists(env.cr, model._table):
            return False
        return True

    table_and_field_names = [(model._name, field.name) for model, field in 
                             filter(_field_filter, models_and_fields)]
    table_and_field_names.sort()
    return table_and_field_names

def table_exists(cr, table_name):
    cr.execute("""
        SELECT EXISTS (
            SELECT 1
              FROM information_schema.tables
             WHERE table_name = %s
               AND table_type = 'BASE TABLE'
        )
    """, [table_name])
    result = cr.fetchone()[0]
    cr.commit()
    return result
