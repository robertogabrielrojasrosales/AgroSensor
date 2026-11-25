import { handleResetPasswordRequest } from '@/lib/recovery-handler'

export async function POST(request: Request) {
  return handleResetPasswordRequest(request)
}
