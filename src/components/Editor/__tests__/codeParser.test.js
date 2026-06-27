import { describe, it, expect } from 'vitest';
import {
  parseSceneConfigs,
  parseTransformFns,
  cleanFunctionBody,
  validateCode,
  stripImports,
  stripExports
} from '../codeParser';

describe('codeParser', () => {
  describe('parseSceneConfigs', () => {
    it('should extract a single scene config correctly', () => {
      const code = `
        const testScene = {
          sceneId: 'test-id',
          triggerType: 'scroll',
          elements: [{ id: 'el-1', timeframe: [0, 1] }]
        };
      `;
      const result = parseSceneConfigs(code);
      expect(result).not.toBeNull();
      expect(result.testScene).toEqual({
        sceneId: 'test-id',
        triggerType: 'scroll',
        elements: [{ id: 'el-1', timeframe: [0, 1] }]
      });
    });

    it('should extract multiple scene configurations ending in Scene', () => {
      const code = `
        const sceneAScene = { sceneId: 'a' };
        let sceneBScene = { sceneId: 'b' };
      `;
      const result = parseSceneConfigs(code);
      expect(result).not.toBeNull();
      expect(result.sceneAScene).toEqual({ sceneId: 'a' });
      expect(result.sceneBScene).toEqual({ sceneId: 'b' });
    });

    it('should return null if no scene configs are found', () => {
      const code = `const a = 123;`;
      const result = parseSceneConfigs(code);
      expect(result).toBeNull();
    });
  });

  describe('cleanFunctionBody', () => {
    it('should strip trailing semicolons and variable assignments', () => {
      const decl = 'const transform = (data) => ({ x: data.x });';
      const result = cleanFunctionBody(decl);
      expect(result).toBe('(data) => ({ x: data.x })');
    });

    it('should extract the callback from a useCallback wrapper', () => {
      const decl = 'const transform = useCallback((data) => ({ x: data.x }), [deps]);';
      const result = cleanFunctionBody(decl);
      expect(result).toBe('(data) => ({ x: data.x })');
    });

    it('should handle functions without useCallback wrappers', () => {
      const decl = `
        function transform(data) {
          return { x: data.x };
        }
      `;
      const result = cleanFunctionBody(decl);
      expect(result).toContain('function transform(data)');
    });
  });

  describe('parseTransformFns', () => {
    it('should parse inline callbacks inside useMotionSubscriber', () => {
      const code = `
        useMotionSubscriber('el-1', ref, (data) => ({ x: data.x }));
      `;
      const result = parseTransformFns(code);
      expect(result['el-1']).toBe('(data) => ({ x: data.x })');
    });

    it('should resolve variable reference declarations', () => {
      const code = `
        const myTransform = (data) => ({ y: data.y });
        useMotionSubscriber('el-2', ref, myTransform);
      `;
      const result = parseTransformFns(code);
      expect(result['el-2']).toBe('(data) => ({ y: data.y })');
    });

    it('should resolve variable reference declarations with colliding names based on proximity', () => {
      const code = `
        const transform = (data) => ({ x: data.x });
        useMotionSubscriber('el-1', ref, transform);
        
        const transform = (data) => ({ y: data.y });
        useMotionSubscriber('el-2', ref, transform);
      `;
      const result = parseTransformFns(code);
      expect(result['el-1']).toBe('(data) => ({ x: data.x })');
      expect(result['el-2']).toBe('(data) => ({ y: data.y })');
    });

    it('should parse inside nested brackets and ignore comments', () => {
      const code = `
        const testTransform = useCallback((data) => {
          // coordinate offsets
          return {
            z: data.z
          };
        }, []);
        useMotionSubscriber('el-3', ref, testTransform);
      `;
      const result = parseTransformFns(code);
      expect(result['el-3']).toContain('return {');
      expect(result['el-3']).toContain('z: data.z');
    });
  });

  describe('validateCode', () => {
    it('should identify valid code syntax', () => {
      const code = 'const a = 1;';
      const result = validateCode(code);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should identify invalid code syntax', () => {
      const code = 'const a = ;';
      const result = validateCode(code);
      expect(result.valid).toBe(false);
    });
  });

  describe('stripImports', () => {
    it('should strip single-line and multiline import statements from code', () => {
      const code = `
        import React from 'react';
        import { useState, useCallback } from 'react';
        import './styles.css';
        import MyComponent from "../MyComponent";
        
        const a = 123;
      `;
      const result = stripImports(code);
      expect(result).not.toContain('import React');
      expect(result).not.toContain('import {');
      expect(result).not.toContain("import './styles.css'");
      expect(result).toContain('const a = 123;');
    });
  });

  describe('stripExports', () => {
    it('should strip export default function and replace it with local assignment', () => {
      const code = `
        export default function myComponent() {}
      `;
      const result = stripExports(code);
      expect(result).toContain('const defaultExport = function myComponent() {}');
      expect(result).not.toContain('export default');
    });

    it('should strip named exports', () => {
      const code = `
        export const a = 1;
        export function b() {}
      `;
      const result = stripExports(code);
      expect(result).toContain('const a = 1;');
      expect(result).toContain('function b() {}');
      expect(result).not.toContain('export const');
      expect(result).not.toContain('export function');
    });
  });
});
