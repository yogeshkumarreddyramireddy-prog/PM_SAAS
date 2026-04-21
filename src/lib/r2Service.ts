import { supabase } from '@/integrations/supabase/client'

interface SignedUrlResponse {
  url: string
  key: string
  method: 'GET' | 'PUT'
}

interface ListResponseItem {
  key?: string
  size?: number
  lastModified?: string
}

const EDGE_FUNCTION = 'r2-sign'

export class R2Service {
  static async getPutUrl(key: string, contentType: string): Promise<SignedUrlResponse> {
    const res = await this.callFunction({ action: 'getPutUrl', key, contentType })
    return res as SignedUrlResponse
  }

  static async getGetUrl(key: string, expiresInSeconds = 900): Promise<SignedUrlResponse> {
    const res = await this.callFunction({ action: 'getGetUrl', key, expiresInSeconds })
    return res as SignedUrlResponse
  }

  static async deleteObject(key: string): Promise<{ ok: boolean }> {
    const res = await this.callFunction({ action: 'deleteObject', key })
    return res as { ok: boolean }
  }

  static async list(prefix?: string): Promise<{ items: ListResponseItem[]; prefix: string }> {
    const res = await this.callFunction({ action: 'listObjects', prefix })
    return res as { items: ListResponseItem[]; prefix: string }
  }

  static async uploadFile(key: string, file: File): Promise<{ success: boolean; key: string; url: string }> {
    // Convert file to base64
    const fileData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const res = await this.callFunction({
      action: 'uploadFile',
      key,
      contentType: file.type,
      fileData
    })
    return res as { success: boolean; key: string; url: string }
  }

  private static async callFunction(body: Record<string, unknown>) {
    try {
      console.log('Calling R2 function:', EDGE_FUNCTION, 'action:', body.action)

      // Use supabase.functions.invoke() which automatically handles
      // auth token refresh — avoids 401 errors from stale getSession() tokens.
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
        body: body,
      })

      if (error) {
        console.error('R2 function error:', error)
        
        // FunctionsHttpError often hides the actual 401 status in its opaque message.
        // The safest approach for edge functions that require auth is to attempt ONE session refresh
        // and retry if any error occurs, just in case it's an expired token issue.
        console.log('Attempting to refresh session and retry R2 function...')
        const { error: refreshError } = await supabase.auth.refreshSession()
        
        if (refreshError) {
          console.error('Auth refresh failed:', refreshError)
          throw new Error(`R2 function error: ${error.message} (Auth refresh also failed)`)
        }
        
        // Retry once
        const { data: retryData, error: retryError } = await supabase.functions.invoke(EDGE_FUNCTION, {
          body: body,
        })
        
        if (retryError) {
          throw new Error(`R2 function retry failed: ${retryError.message}`)
        }
        
        console.log('R2 function retry success:', retryData)
        return retryData
      }

      console.log('R2 function success:', data)
      return data
    } catch (error) {
      console.error('R2Service callFunction error:', error)
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Failed to call R2 function: ${error}`)
    }
  }
}
