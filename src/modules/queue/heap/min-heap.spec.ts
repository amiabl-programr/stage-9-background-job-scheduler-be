import { MinHeap } from './min-heap';

interface TestItem {
  id: string;
  priority: number;
}

const compare = (a: TestItem, b: TestItem) => a.priority - b.priority;

describe('MinHeap', () => {
  let heap: MinHeap<TestItem>;

  beforeEach(() => {
    heap = new MinHeap<TestItem>(compare);
  });

  it('starts empty', () => {
    expect(heap.size).toBe(0);
    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
  });

  it('pushes and peeks the minimum element', () => {
    heap.push({ id: 'a', priority: 3 });
    heap.push({ id: 'b', priority: 1 });
    heap.push({ id: 'c', priority: 2 });

    expect(heap.peek()).toEqual({ id: 'b', priority: 1 });
  });

  it('pops elements in priority order', () => {
    heap.push({ id: 'a', priority: 3 });
    heap.push({ id: 'b', priority: 1 });
    heap.push({ id: 'c', priority: 2 });

    expect(heap.pop()).toEqual({ id: 'b', priority: 1 });
    expect(heap.pop()).toEqual({ id: 'c', priority: 2 });
    expect(heap.pop()).toEqual({ id: 'a', priority: 3 });
    expect(heap.pop()).toBeUndefined();
  });

  it('handles a single element', () => {
    heap.push({ id: 'a', priority: 5 });
    expect(heap.size).toBe(1);
    expect(heap.pop()).toEqual({ id: 'a', priority: 5 });
    expect(heap.size).toBe(0);
  });

  it('pops all items with duplicate priorities', () => {
    heap.push({ id: 'x', priority: 1 });
    heap.push({ id: 'y', priority: 1 });
    heap.push({ id: 'z', priority: 1 });

    const ids = [heap.pop()!.id, heap.pop()!.id, heap.pop()!.id].sort();
    expect(ids).toEqual(['x', 'y', 'z']);
    expect(heap.pop()).toBeUndefined();
  });

  it('clears the heap', () => {
    heap.push({ id: 'a', priority: 1 });
    heap.push({ id: 'b', priority: 2 });
    heap.clear();
    expect(heap.size).toBe(0);
  });

  it('toArray returns a copy of elements', () => {
    heap.push({ id: 'a', priority: 2 });
    heap.push({ id: 'b', priority: 1 });

    const arr = heap.toArray();
    expect(arr).toHaveLength(2);
    // Modifying the copy doesn't affect the original
    arr.pop();
    expect(heap.size).toBe(2);
  });

  it('handles descending input order', () => {
    for (let i = 10; i >= 1; i--) {
      heap.push({ id: `item-${i}`, priority: i });
    }

    expect(heap.size).toBe(10);
    for (let i = 1; i <= 10; i++) {
      expect(heap.pop()!.priority).toBe(i);
    }
  });

  it('handles ascending input order', () => {
    for (let i = 1; i <= 100; i++) {
      heap.push({ id: `item-${i}`, priority: i });
    }

    expect(heap.size).toBe(100);
    for (let i = 1; i <= 100; i++) {
      expect(heap.pop()!.priority).toBe(i);
    }
    expect(heap.pop()).toBeUndefined();
  });

  it('supports composite comparison (priority then id)', () => {
    const compositeCompare = (a: TestItem, b: TestItem) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.id.localeCompare(b.id);
    };

    const h = new MinHeap<TestItem>(compositeCompare);
    h.push({ id: 'z', priority: 1 });
    h.push({ id: 'a', priority: 2 });
    h.push({ id: 'm', priority: 1 });

    expect(h.pop()!.id).toBe('m');
    expect(h.pop()!.id).toBe('z');
    expect(h.pop()!.id).toBe('a');
  });

  it('does not fail when popping after clear', () => {
    heap.push({ id: 'a', priority: 1 });
    heap.clear();
    expect(heap.pop()).toBeUndefined();
    expect(heap.peek()).toBeUndefined();
    expect(heap.size).toBe(0);
  });
});
