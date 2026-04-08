
import { createClient } from '@supabase/supabase-js'

const projectUrl = 'https://vhctzrgzwzsvdptdahsv.supabase.co'
const projectKey = 'sb_publishable_f0UBCEW9zBjvx_bD32F8_Q_9ExQlkSu' // User provided key

export const supabase = createClient(projectUrl, projectKey)
