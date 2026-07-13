export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ReviewAction = 'approve' | 'reject' | 'undo';
export type PublicationFormat = 'SINGLE_IMAGE' | 'PDF_DOCUMENT';

export interface PublicationCandidate {
  id: string;
  reviewStatus: ReviewStatus;
  imageUrl: string | null;
  collectionDate: string;
  locked: boolean;
}

export class DesignerPolicyError extends Error {}

export function collectionDateFor(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function nextReviewStatus(
  current: ReviewStatus,
  action: ReviewAction,
  published: boolean,
): ReviewStatus {
  if (published) throw new DesignerPolicyError('Published posts cannot be reviewed');
  if (action === 'undo') return 'PENDING';
  if (action === 'approve') return 'APPROVED';
  if (action === 'reject') return 'REJECTED';
  return current;
}

export function validatePublicationSelection(
  posts: PublicationCandidate[],
): { format: PublicationFormat; collectionDate: string } {
  if (posts.length === 0 || posts.length === 2) {
    throw new DesignerPolicyError('Select one post or at least three posts');
  }
  if (posts.length > 300) {
    throw new DesignerPolicyError('LinkedIn document posts support at most 300 pages');
  }
  if (posts.some((post) => post.reviewStatus !== 'APPROVED' || !post.imageUrl)) {
    throw new DesignerPolicyError('Every selected post must be approved and fully rendered');
  }
  if (posts.some((post) => post.locked)) {
    throw new DesignerPolicyError('A selected post is already reserved or published');
  }

  const collectionDate = posts[0].collectionDate;
  if (posts.some((post) => post.collectionDate !== collectionDate)) {
    throw new DesignerPolicyError('Selected posts must belong to the same daily collection');
  }

  return {
    format: posts.length === 1 ? 'SINGLE_IMAGE' : 'PDF_DOCUMENT',
    collectionDate,
  };
}
