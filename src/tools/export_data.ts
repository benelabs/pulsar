import { ExportDataInputSchema } from '../schemas/tools.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';
import logger from '../logger.js';

export interface ExportDataOutput {
  filename: string;
  format: string;
  data_length: number;
  file_size: number;
  download_url?: string;
}

/**
 * Converts an array of objects to CSV format
 */
function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) {
    return '';
  }

  // Get all unique keys from all objects
  const headers = Array.from(new Set(data.flatMap((obj) => Object.keys(obj))));

  // Build CSV rows
  const rows = data.map((obj) => {
    return headers
      .map((header) => {
        const value = obj[header];
        if (value === null || value === undefined) {
          return '';
        }
        // Escape quotes and wrap in quotes if contains commas, quotes, or newlines
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Tool: export_data
 * Exports data to CSV or JSON format files
 * Returns information about the exported file
 */
export const exportData: McpToolHandler<typeof ExportDataInputSchema> = async (input: unknown) => {
  // Validate input schema
  const validatedInput = ExportDataInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError('Invalid input for export_data', validatedInput.error.format());
  }

  const { data, format, filename, include_timestamp } = validatedInput.data;

  // Ensure data is an array for processing
  const dataArray = Array.isArray(data) ? data : [data];

  if (dataArray.length === 0) {
    throw new PulsarValidationError('No data to export', {
      data_length: 0,
    });
  }

  // Generate filename if not provided
  const baseFilename = filename || `export_${Date.now()}`;
  const fullFilename = `${baseFilename}.${format}`;

  let fileContent: string;
  let fileSize: number;

  try {
    if (format === 'csv') {
      fileContent = convertToCSV(dataArray as Record<string, unknown>[]);
      if (include_timestamp) {
        fileContent = `# Generated: ${new Date().toISOString()}\n${fileContent}`;
      }
    } else {
      // JSON format
      const exportData = include_timestamp
        ? {
            metadata: {
              generated_at: new Date().toISOString(),
              record_count: dataArray.length,
            },
            data: dataArray,
          }
        : dataArray;

      fileContent = JSON.stringify(exportData, null, 2);
    }

    fileSize = Buffer.byteLength(fileContent, 'utf8');

    // In a real implementation, you would save the file to disk or cloud storage
    // For this MCP tool, we return the content as a resource
    logger.info(
      {
        filename: fullFilename,
        format,
        data_length: dataArray.length,
        file_size: fileSize,
      },
      'Data export completed'
    );

    return {
      filename: fullFilename,
      format,
      data_length: dataArray.length,
      file_size: fileSize,
      content: fileContent,
      // In a real implementation, you might return a download URL
      // download_url: `/exports/${fullFilename}`
    };
  } catch (err: unknown) {
    const error = err as Error;
    throw new PulsarValidationError(`Failed to export data: ${error.message}`, {
      originalError: error,
    });
  }
};
