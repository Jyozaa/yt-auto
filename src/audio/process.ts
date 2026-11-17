import {spawn} from 'node:child_process';

export function run(command: string, args: string[], maxOutput = 24 * 1024 * 1024): Promise<{stdout: Buffer; stderr: string}> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutput) {
        reject(new Error(`${command} exceeded its output limit`));
        proc.kill();
      } else chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-24000); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve({stdout: Buffer.concat(chunks), stderr});
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-2500)}`));
    });
  });
}

export const ffmpeg = (args: string[]) => run('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args]);
export async function probe(path: string) {
  const result = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]);
  return JSON.parse(result.stdout.toString()) as {
    format: {duration: string; size: string};
    streams: {codec_type: string; codec_name: string; duration: string; width?: number; height?: number;
      r_frame_rate?: string; pix_fmt?: string; sample_rate?: string; channels?: number}[];
  };
}
