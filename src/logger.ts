export interface Logger {
  emit: (message: string, payload?: unknown) => void
}

export async function useLogger(
  path: string,
): Promise<AsyncDisposable & Logger> {
  const file = await Deno.open(path, { create: true, append: true })

  const encoder = new TextEncoder()
  async function write(data: unknown) {
    try {
      const serialized = JSON.stringify(data, (_key, value) => {
        if (typeof value === 'bigint') return Number(value)
        return value
      }) + '\n'
      await file.write(encoder.encode(serialized))
    } catch (err) {
      console.error(`Could not write log:`, err)
    }
  }

  return {
    async [Symbol.asyncDispose]() {
      await using _file = file
    },
    emit: (message, payload) => {
      const time = new Date().toISOString()
      // console.log(
      //   colors.gray("LOG"),
      //   message,
      //   Deno.inspect(payload, { colors: true, depth: 3, compact: true }),
      // )
      write({ time, msg: message, payload })
    },
  }
}
