export type ActionFailure = {
  success: false;
  error: string;
};

export type ActionResult<T> =
  | {
      success: true;
      data: T;
    }
  | ActionFailure;
