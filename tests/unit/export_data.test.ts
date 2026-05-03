import { describe, it, expect } from 'vitest';

import { exportData } from '../../src/tools/export_data.js';

describe('exportData', () => {
  it('should export data to CSV format', async () => {
    const testData = [
      { name: 'Alice', age: 30, city: 'New York' },
      { name: 'Bob', age: 25, city: 'London' },
      { name: 'Charlie', age: 35, city: 'Paris' },
    ];

    const result = await exportData({
      data: testData,
      format: 'csv',
      filename: 'test_export',
      include_timestamp: false,
    });

    expect(result.filename).toBe('test_export.csv');
    expect(result.format).toBe('csv');
    expect(result.data_length).toBe(3);
    expect(result.file_size).toBeGreaterThan(0);
    expect(result.content).toContain('name,age,city');
    expect(result.content).toContain('Alice,30,New York');
    expect(result.content).toContain('Bob,25,London');
  });

  it('should export data to JSON format', async () => {
    const testData = [
      { id: 1, value: 'test1' },
      { id: 2, value: 'test2' },
    ];

    const result = await exportData({
      data: testData,
      format: 'json',
      include_timestamp: false,
    });

    expect(result.filename).toMatch(/export_\d+\.json/);
    expect(result.format).toBe('json');
    expect(result.data_length).toBe(2);
    expect(result.file_size).toBeGreaterThan(0);

    const parsedContent = JSON.parse(result.content as string);
    expect(Array.isArray(parsedContent)).toBe(true);
    expect(parsedContent).toHaveLength(2);
    expect(parsedContent[0]).toEqual({ id: 1, value: 'test1' });
  });

  it('should export single object to JSON', async () => {
    const singleData = { account: 'GABC123', balance: '100.5', currency: 'XLM' };

    const result = await exportData({
      data: singleData,
      format: 'json',
      include_timestamp: true,
    });

    expect(result.format).toBe('json');
    expect(result.data_length).toBe(1);
    expect(result.content).toContain('generated_at');
    expect(result.content).toContain('account');
    expect(result.content).toContain('GABC123');
  });

  it('should handle empty data array', async () => {
    await expect(
      exportData({
        data: [],
        format: 'csv',
        include_timestamp: false,
      })
    ).rejects.toThrow('No data to export');
  });
});
