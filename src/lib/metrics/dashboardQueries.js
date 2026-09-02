import { supabase } from '../supabaseClient'; // adjust to your actual client export path

// All queries scoped to the current org via RLS — org_id filter below is
// belt-and-suspenders, matching the OrgContext pattern used elsewhere.

export async function getRevenueTrend(orgId, months = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const { data, error } = await supabase
    .from('v_widget_revenue_trend')
    .select('month, revenue')
    .eq('org_id', orgId)
    .gte('month', since.toISOString().slice(0, 10))
    .order('month', { ascending: true });

  if (error) throw error;
  return data.map(row => ({ label: row.month, value: Number(row.revenue) }));
}

export async function getARAging(orgId) {
  const { data, error } = await supabase
    .from('v_widget_ar_aging')
    .select('bucket, amount')
    .eq('org_id', orgId);

  if (error) throw error;

  const order = ['0-30', '31-60', '61-90', '90+'];
  const byBucket = Object.fromEntries(data.map(r => [r.bucket, Number(r.amount)]));
  return order.map(bucket => ({ label: bucket, value: byBucket[bucket] ?? 0 }));
}

export async function getTopClients(orgId, limit = 5) {
  const { data, error } = await supabase
    .from('v_widget_top_clients')
    .select('client_id, client_name, total_revenue')
    .eq('org_id', orgId)
    .order('total_revenue', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data.map(row => ({
    label: row.client_name,
    value: Number(row.total_revenue),
  }));
}

export async function getOverdueInvoices(orgId) {
  const { data, error } = await supabase
    .from('v_widget_overdue_invoices')
    .select('invoice_number, client_name, due_date, amount_due, days_overdue')
    .eq('org_id', orgId)
    .order('days_overdue', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getActiveOrgsCount(orgId) {
  const { data, error } = await supabase
    .from('v_widget_active_orgs_count')
    .select('active_client_count')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw error;
  return data?.active_client_count ?? 0;
}