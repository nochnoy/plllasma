export interface IHttpInput {
  error?: string;
  errorMessage?: string;
}

export interface IHttpAddMatrixImages extends IHttpInput {
  images?: string[];
}
