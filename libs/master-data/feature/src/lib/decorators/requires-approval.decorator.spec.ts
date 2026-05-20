import { Role } from '@autoflow/shared-types';
import {
  RequiresApproval,
  REQUIRES_APPROVAL_KEY,
} from './requires-approval.decorator';

describe('RequiresApproval Decorator', () => {
  it('should export the REQUIRES_APPROVAL_KEY constant', () => {
    expect(REQUIRES_APPROVAL_KEY).toBe('requires_approval');
  });

  it('should set metadata with a single role', () => {
    // Apply decorator to a test class method
    class TestController {
      @RequiresApproval(Role.MANAGER)
      approve() {
        return;
      }
    }

    const metadata = Reflect.getMetadata(
      REQUIRES_APPROVAL_KEY,
      TestController.prototype.approve,
    );

    expect(metadata).toEqual([Role.MANAGER]);
  });

  it('should set metadata with multiple roles', () => {
    class TestController {
      @RequiresApproval(Role.MANAGER, Role.CFO, Role.ADMIN)
      approve() {
        return;
      }
    }

    const metadata = Reflect.getMetadata(
      REQUIRES_APPROVAL_KEY,
      TestController.prototype.approve,
    );

    expect(metadata).toEqual([Role.MANAGER, Role.CFO, Role.ADMIN]);
  });

  it('should set empty array when no roles specified', () => {
    class TestController {
      @RequiresApproval()
      approve() {
        return;
      }
    }

    const metadata = Reflect.getMetadata(
      REQUIRES_APPROVAL_KEY,
      TestController.prototype.approve,
    );

    expect(metadata).toEqual([]);
  });

  it('should set metadata with CFO-only role', () => {
    class TestController {
      @RequiresApproval(Role.CFO)
      closePeriod() {
        return;
      }
    }

    const metadata = Reflect.getMetadata(
      REQUIRES_APPROVAL_KEY,
      TestController.prototype.closePeriod,
    );

    expect(metadata).toEqual([Role.CFO]);
  });

  it('should not bleed metadata between methods', () => {
    class TestController {
      @RequiresApproval(Role.MANAGER)
      approve() {
        return;
      }

      @RequiresApproval(Role.CFO)
      closePeriod() {
        return;
      }
    }

    const approveMetadata = Reflect.getMetadata(
      REQUIRES_APPROVAL_KEY,
      TestController.prototype.approve,
    );
    const closePeriodMetadata = Reflect.getMetadata(
      REQUIRES_APPROVAL_KEY,
      TestController.prototype.closePeriod,
    );

    expect(approveMetadata).toEqual([Role.MANAGER]);
    expect(closePeriodMetadata).toEqual([Role.CFO]);
  });
});
